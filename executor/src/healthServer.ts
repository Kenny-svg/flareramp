import { createServer, type Server } from "node:http";
import type { Hex } from "viem";
import { truncatePublicErrorMessage } from "./flareExecutor";
import type { TransactionJob } from "./transactionStore";
import type { StoredUserOp } from "./userOpStore";

export interface ExecutorHealth {
  storeReady: boolean;
  watcherConnected: boolean;
}

export interface PublicTransactionStatus {
  transactionId: string;
  stage: TransactionJob["stage"];
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
  payment: {
    sourceAddress: string;
    destinationAddress: string;
    amountDrops: string;
  };
  stageHistory: Array<{
    stage: TransactionJob["stage"];
    at: string;
  }>;
  attestation?: {
    submissionTransactionHash?: string;
    votingRoundId?: string;
    finalized?: boolean;
  };
  execution?: {
    transactionHash: string;
    assetManager: string;
  };
  settlement?: {
    flareTransactionHash: string;
    blockNumber: string;
    recipient: string;
    executor: string;
    mintedAmountUBA: string;
    mintingFeeUBA: string;
    executorFeeUBA: string;
    vaultDeposit?: boolean;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    occurredAt: string;
  };
}

export function toPublicTransactionStatus(
  job: TransactionJob,
): PublicTransactionStatus {
  return {
    transactionId: job.id,
    stage: job.stage,
    attempts: job.attempts,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
    nextAttemptAt:
      job.nextAttemptAt === null
        ? null
        : new Date(job.nextAttemptAt).toISOString(),
    payment: {
      sourceAddress: job.instruction.sourceXrplAddress,
      destinationAddress: job.instruction.destinationXrplAddress,
      amountDrops: job.instruction.amountDrops.toString(),
    },
    stageHistory: (
      job.stageHistory ?? [{ stage: job.stage, at: job.createdAt }]
    ).map((entry) => ({
      stage: entry.stage,
      at: new Date(entry.at).toISOString(),
    })),
    attestation: job.attestation
      ? {
          submissionTransactionHash:
            job.attestation.submissionTransactionHash,
          votingRoundId: job.attestation.votingRoundId?.toString(),
          finalized: job.attestation.finalized,
        }
      : undefined,
    execution: job.execution,
    settlement: job.settlement
      ? {
          flareTransactionHash: job.settlement.flareTransactionHash,
          blockNumber: job.settlement.blockNumber.toString(),
          recipient: job.settlement.recipient,
          executor: job.settlement.executor,
          mintedAmountUBA: job.settlement.mintedAmountUBA.toString(),
          mintingFeeUBA: job.settlement.mintingFeeUBA.toString(),
          executorFeeUBA: job.settlement.executorFeeUBA.toString(),
          vaultDeposit: job.settlement.vaultDeposit,
        }
      : undefined,
    error: job.lastError
      ? {
          code: job.lastError.code,
          message: truncatePublicErrorMessage(job.lastError.message),
          retryable: job.lastError.retryable,
          occurredAt: new Date(job.lastError.occurredAt).toISOString(),
        }
      : undefined,
  };
}

const requestWindows = new Map<string, { count: number; resetAt: number }>();

function transactionRequestAllowed(address: string, now = Date.now()): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const key = address || "unknown";
  const current = requestWindows.get(key);
  if (!current || current.resetAt <= now) {
    requestWindows.set(key, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  return {
    allowed: current.count <= 120,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
  };
}

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Hard cap on the public settlement index, independent of caller input. */
export const SETTLEMENT_INDEX_LIMIT = 20;

/**
 * Settled mints, newest first, for the public Proof Receipt index.
 *
 * Only `minted` jobs are exposed: a settled mint has already written both an
 * XRPL payment and a Coston2 settlement to public ledgers, so this endpoint
 * aggregates public data rather than disclosing anything new. In-flight and
 * failed jobs stay reachable only via `/transactions/:id`, which needs the
 * unguessable 64-hex id, so a user mid-mint is never listed.
 */
export function toSettlementIndex(
  jobs: TransactionJob[],
): PublicTransactionStatus[] {
  return jobs
    .filter((job) => job.stage === "minted" && job.settlement)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, SETTLEMENT_INDEX_LIMIT)
    .map(toPublicTransactionStatus);
}

export async function startHealthServer(
  port: number,
  getHealth: () => ExecutorHealth,
  getTransaction?: (transactionId: string) => Promise<TransactionJob | null>,
  getMetrics?: () => Promise<Record<string, number>>,
  registerUserOp?: (entry: StoredUserOp) => Promise<void>,
  listTransactions?: () => Promise<TransactionJob[]>,
): Promise<Server> {
  const server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/userops" && registerUserOp) {
      try {
        const body = (await readJsonBody(request)) as {
          memoHash?: string;
          userOpData?: string;
          sourceAddress?: string;
        } | null;
        if (
          !body?.memoHash ||
          !body.userOpData ||
          !body.sourceAddress ||
          !/^0x[0-9a-fA-F]{64}$/.test(body.memoHash) ||
          !/^0x[0-9a-fA-F]+$/.test(body.userOpData)
        ) {
          response
            .writeHead(400, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "Invalid userOp registration body" }));
          return;
        }
        await registerUserOp({
          memoHash: body.memoHash.toLowerCase() as Hex,
          userOpData: body.userOpData as Hex,
          sourceAddress: body.sourceAddress,
          createdAt: Date.now(),
        });
        response
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ status: "registered" }));
      } catch (error) {
        response
          .writeHead(500, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "userOp registration failed",
            }),
          );
      }
      return;
    }

    if (request.method !== "GET") {
      response.writeHead(405).end();
      return;
    }
    if (request.url === "/health") {
      response
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url === "/ready") {
      const health = getHealth();
      const ready = health.storeReady && health.watcherConnected;
      response
        .writeHead(ready ? 200 : 503, {
          "Content-Type": "application/json",
        })
        .end(
          JSON.stringify({
            status: ready ? "ready" : "not_ready",
            checks: health,
          }),
        );
      return;
    }
    if (request.url === "/metrics" && getMetrics) {
      response
        .writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        })
        .end(JSON.stringify(await getMetrics()));
      return;
    }
    if (request.url === "/settlements" && listTransactions) {
      const limit = transactionRequestAllowed(
        request.socket.remoteAddress ?? "unknown",
      );
      if (!limit.allowed) {
        response
          .writeHead(429, {
            "Content-Type": "application/json",
            "Retry-After": String(limit.retryAfterSeconds),
          })
          .end(JSON.stringify({ status: "rate_limited" }));
        return;
      }
      try {
        const settlements = toSettlementIndex(await listTransactions());
        response
          .writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          })
          .end(
            JSON.stringify({
              settlements,
              checkedAt: new Date().toISOString(),
            }),
          );
      } catch {
        response
          .writeHead(500, { "Content-Type": "application/json" })
          .end(JSON.stringify({ status: "store_error" }));
      }
      return;
    }
    const transactionMatch = request.url?.match(
      /^\/transactions\/(?:0x)?([0-9a-fA-F]{64})$/,
    );
    if (transactionMatch && getTransaction) {
      const limit = transactionRequestAllowed(
        request.socket.remoteAddress ?? "unknown",
      );
      if (!limit.allowed) {
        response
          .writeHead(429, {
            "Content-Type": "application/json",
            "Retry-After": String(limit.retryAfterSeconds),
          })
          .end(JSON.stringify({ status: "rate_limited" }));
        return;
      }
      try {
        const job = await getTransaction(transactionMatch[1].toUpperCase());
        if (!job) {
          response
            .writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ status: "not_observed" }));
          return;
        }
        response
          .writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          })
          .end(JSON.stringify(toPublicTransactionStatus(job)));
      } catch {
        response
          .writeHead(500, { "Content-Type": "application/json" })
          .end(JSON.stringify({ status: "store_error" }));
      }
      return;
    }
    response.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}
