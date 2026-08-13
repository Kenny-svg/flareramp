import "server-only";

export interface StableReadOptions {
  /** Maximum reads to attempt before giving up on convergence. */
  attempts?: number;
  /** Delay between reads, so this doesn't hammer the RPC. */
  delayMs?: number;
}

export interface StableReadResult {
  value: bigint;
  /** True once two consecutive reads agreed. False means the budget ran out
   *  without agreement — `value` is the last read, not a confirmed one. */
  stable: boolean;
  attempts: number;
}

/**
 * Reads a mutable on-chain uint256 (balanceOf, allowance, …) repeatedly until
 * two consecutive reads agree, instead of trusting a single call.
 *
 * Public RPC endpoints for a given chain are typically served by more than
 * one backend node behind a single hostname. Under load, different requests
 * can land on nodes at different sync heights, so two independent `latest`
 * reads of the *same* storage slot a moment apart can legitimately disagree —
 * not because state changed, but because the two calls were answered by two
 * nodes that don't yet agree on what "latest" is. Observed directly on
 * Coston2: sequential, fully-resolved balance reads for one address returned
 * 10, then 0, then (eventually) the correct 3.6, with no transaction from
 * that address in between.
 *
 * This can't be fixed by picking a different `blockTag` — a lagging node's
 * own idea of "latest" or "finalized" is still lagging, it isn't a
 * fork/consensus disagreement to arbitrate. Retrying until the answer stops
 * moving is the standard mitigation for eventually-consistent reads and
 * converges regardless of *why* a given node was behind.
 *
 * The common case costs one extra call: if the first two reads already
 * agree (typical), this returns immediately. `stable: false` on the result
 * means the value is still the best available read, just not confirmed —
 * callers should surface that rather than presenting it with full
 * confidence.
 */
export async function readStableUint256(
  read: () => Promise<bigint>,
  options?: StableReadOptions,
): Promise<StableReadResult> {
  const attempts = options?.attempts ?? 5;
  const delayMs = options?.delayMs ?? 250;

  let previous: bigint | null = null;
  let last = 0n;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    last = await read();
    if (previous !== null && last === previous) {
      return { value: last, stable: true, attempts: attempt };
    }
    previous = last;
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { value: last, stable: false, attempts };
}
