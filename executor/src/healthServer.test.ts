import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startHealthServer } from "./healthServer";
import type { TransactionJob } from "./transactionStore";

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
