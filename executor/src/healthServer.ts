import { createServer, type Server } from "node:http";
import type { TransactionJob } from "./transactionStore";

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
        }
      : undefined,
    error: job.lastError
      ? {
          code: job.lastError.code,
          message: job.lastError.message,
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

export async function startHealthServer(
  port: number,
  getHealth: () => ExecutorHealth,
  getTransaction?: (transactionId: string) => Promise<TransactionJob | null>,
  getMetrics?: () => Promise<Record<string, number>>,
): Promise<Server> {
  const server = createServer(async (request, response) => {
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
