import { describe, expect, it, vi } from "vitest";
import { readStableUint256 } from "./stableRead";

function sequence(values: bigint[]) {
  let i = 0;
  return async () => {
    const value = values[Math.min(i, values.length - 1)];
    i++;
    return value;
  };
}

describe("readStableUint256", () => {
  it("returns immediately when the first two reads already agree", async () => {
    const read = sequence([3_600_000n, 3_600_000n, 3_600_000n]);
    const result = await readStableUint256(read, { delayMs: 0 });
    expect(result).toEqual({ value: 3_600_000n, stable: true, attempts: 2 });
  });

  it("converges once disagreeing reads settle down", async () => {
    // Mirrors what was observed live on Coston2: sequential reads of the same
    // address returned 10, then 0, then the correct 3.6 before agreeing.
    const read = sequence([10_000_000n, 0n, 3_600_000n, 3_600_000n]);
    const result = await readStableUint256(read, { delayMs: 0 });
    expect(result).toEqual({ value: 3_600_000n, stable: true, attempts: 4 });
  });

  it("reports instability rather than guessing when the budget runs out", async () => {
    const read = sequence([1n, 2n, 3n, 4n, 5n, 6n]);
    const result = await readStableUint256(read, { attempts: 3, delayMs: 0 });
    // Never two matching consecutive reads within 3 attempts — the caller
    // gets the last value plus an honest `stable: false`, not a silent guess.
    expect(result).toEqual({ value: 3n, stable: false, attempts: 3 });
  });

  it("does not read more times than necessary", async () => {
    const read = vi.fn(sequence([7n, 7n, 7n, 7n, 7n]));
    await readStableUint256(read, { delayMs: 0 });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("waits between attempts so it does not hammer the RPC", async () => {
    const read = sequence([1n, 2n, 2n]);
    const start = Date.now();
    await readStableUint256(read, { delayMs: 20 });
    // Two gaps before the 3rd (agreeing) read lands — a loose lower bound,
    // not asserting exact timing.
    expect(Date.now() - start).toBeGreaterThanOrEqual(30);
  });
});
