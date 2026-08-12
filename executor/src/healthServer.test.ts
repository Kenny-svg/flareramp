import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  SETTLEMENT_INDEX_LIMIT,
  startHealthServer,
  toSettlementIndex,
} from "./healthServer";
import type { TransactionJob, TransactionStage } from "./transactionStore";

const servers: Awaited<ReturnType<typeof startHealthServer>>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

describe("executor health server", () => {
  it("separates liveness from readiness", async () => {
    const health = { storeReady: true, watcherConnected: false };
    const server = await startHealthServer(0, () => health);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;

    expect(
      await fetch(`http://127.0.0.1:${port}/health`).then(
        (response) => response.status,
      ),
    ).toBe(200);
    expect(
      await fetch(`http://127.0.0.1:${port}/ready`).then(
        (response) => response.status,
      ),
    ).toBe(503);

    health.watcherConnected = true;
    expect(
      await fetch(`http://127.0.0.1:${port}/ready`).then(
        (response) => response.status,
      ),
    ).toBe(200);
  });

  it("exposes a public projection of persistent transaction state", async () => {
    const transactionId = "A".repeat(64);
    const job: TransactionJob = {
      id: transactionId,
      stage: "attestation_requested",
      instruction: {
        txHash: transactionId,
        sourceXrplAddress: "rSource",
        destinationXrplAddress: "rVault",
        amountDrops: 1_000_000n,
        memoHex: "0x1234",
        destinationTag: null,
      },
      attempts: 1,
      nextAttemptAt: null,
      createdAt: Date.parse("2026-08-10T08:00:00.000Z"),
      updatedAt: Date.parse("2026-08-10T08:01:00.000Z"),
      attestation: {
        abiEncodedRequest: "0xabcd",
        votingRoundId: 123n,
        finalized: false,
      },
    };
    const server = await startHealthServer(
      0,
      () => ({ storeReady: true, watcherConnected: true }),
      async (id) => (id === transactionId ? job : null),
    );
    servers.push(server);
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(
      `http://127.0.0.1:${port}/transactions/${transactionId.toLowerCase()}`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      transactionId,
      stage: "attestation_requested",
      attempts: 1,
      attestation: {
        votingRoundId: "123",
        finalized: false,
      },
    });
    expect(
      await fetch(
        `http://127.0.0.1:${port}/transactions/${"B".repeat(64)}`,
      ).then((result) => result.status),
    ).toBe(404);
  });
});

function settlementJob(
  id: string,
  stage: TransactionStage,
  updatedAt: number,
  settled = true,
): TransactionJob {
  return {
    id,
    stage,
    instruction: {
      txHash: id,
      sourceXrplAddress: "rSource",
      destinationXrplAddress: "rVault",
      amountDrops: 1_000_000n,
      memoHex: "0x1234",
      destinationTag: null,
    },
    attempts: 1,
    nextAttemptAt: null,
    createdAt: updatedAt - 1_000,
    updatedAt,
    settlement: settled
      ? {
          flareTransactionHash: `0x${"f".repeat(64)}`,
          blockNumber: 1n,
          recipient: "0x0000000000000000000000000000000000000001",
          executor: "0x0000000000000000000000000000000000000002",
          mintedAmountUBA: 1_000_000n,
          mintingFeeUBA: 0n,
          executorFeeUBA: 0n,
        }
      : undefined,
  } as TransactionJob;
}

describe("settlement index", () => {
  it("exposes only settled mints, newest first", () => {
    const index = toSettlementIndex([
      settlementJob("A".repeat(64), "minted", 3_000),
      settlementJob("B".repeat(64), "attestation_requested", 9_000, false),
      settlementJob("C".repeat(64), "minted", 5_000),
      settlementJob("D".repeat(64), "recovery_required", 8_000, false),
    ]);

    // In-flight and failed jobs stay private to /transactions/:id, so a user
    // mid-mint is never listed on the public index.
    expect(index.map((entry) => entry.transactionId)).toEqual([
      "C".repeat(64),
      "A".repeat(64),
    ]);
  });

  it("caps the index regardless of store size", () => {
    const jobs = Array.from({ length: SETTLEMENT_INDEX_LIMIT + 5 }, (_, i) =>
      settlementJob(String(i).padStart(64, "0"), "minted", i * 1_000),
    );
    expect(toSettlementIndex(jobs)).toHaveLength(SETTLEMENT_INDEX_LIMIT);
  });

  it("ignores a minted job with no settlement record", () => {
    expect(
      toSettlementIndex([
        settlementJob("E".repeat(64), "minted", 1_000, false),
      ]),
    ).toEqual([]);
  });
});
