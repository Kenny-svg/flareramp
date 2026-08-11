import "server-only";

import { resolve } from "node:path";
import dotenv from "dotenv";
import {
  createCoston2PublicClient,
  resolveFxrpContracts,
} from "flareramp-executor/flare-contracts";
import { ifAssetAbi } from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import { getAddress } from "viem";
import { getWebServerConfig } from "./config";

for (const envPath of [
  resolve(process.cwd(), "../executor/.env"),
  resolve(process.cwd(), "executor/.env"),
]) {
  dotenv.config({ path: envPath });
}

type ExecutorStage =
  | "waiting_for_executor"
  | "observed"
  | "confirming"
  | "attestation_requested"
  | "finalized"
  | "proof_fetched"
  | "execution_submitted"
  | "minted"
  | "failed"
  | "recovery_required";

export interface PublicExecutorJob {
  transactionId: string;
  stage: Exclude<ExecutorStage, "waiting_for_executor">;
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
    stage: Exclude<ExecutorStage, "waiting_for_executor">;
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

export interface MintProgressStatus {
  transactionId: string;
  stage: ExecutorStage;
  phase: "prove" | "mint" | "complete" | "attention";
  message: string;
  expectedTiming: string;
  executorReachable: boolean;
  attempts: number;
  updatedAt: string;
  nextAttemptAt: string | null;
  votingRoundId?: string;
  fdcSubmissionTransactionHash?: string;
  flareTransactionHash?: string;
  settlement?: PublicExecutorJob["settlement"];
  error?: PublicExecutorJob["error"];
  fxrpBalance?: {
    recipient: string;
    balanceUBA: string;
    source: string;
    timestamp: string;
  };
}

function stagePresentation(stage: ExecutorStage): Pick<
  MintProgressStatus,
  "phase" | "message" | "expectedTiming"
> {
  switch (stage) {
    case "waiting_for_executor":
      return {
        phase: "prove",
        message: "XRPL payment is validated; waiting for the executor watcher",
        expectedTiming: "Usually under 15 seconds",
      };
    case "observed":
    case "confirming":
      return {
        phase: "prove",
        message: "Executor observed the payment and is preparing its FDC request",
        expectedTiming: "Usually under 30 seconds",
      };
    case "attestation_requested":
      return {
        phase: "prove",
        message: "FDC providers are confirming the XRPL payment",
        expectedTiming: "Typically 90–180 seconds; keep this page open",
      };
    case "finalized":
      return {
        phase: "prove",
        message: "FDC voting round finalized; retrieving the Merkle proof",
        expectedTiming: "Usually another 5–30 seconds",
      };
    case "proof_fetched":
      return {
        phase: "mint",
        message: "Payment proof verified; simulating the FXRP mint",
        expectedTiming: "Usually under 30 seconds",
      };
    case "execution_submitted":
      return {
        phase: "mint",
        message: "Mint transaction submitted to Coston2",
        expectedTiming: "Usually one or two Coston2 blocks",
      };
    case "minted":
      return {
        phase: "complete",
        message: "FXRP mint completed",
        expectedTiming: "Complete",
      };
    case "failed":
    case "recovery_required":
      return {
        phase: "attention",
        message:
          stage === "failed"
            ? "Executor stopped after a non-retryable failure"
            : "Mint requires executor recovery",
        expectedTiming: "Review the reported executor error",
      };
  }
}

async function readFxrpBalance(recipient: string) {
  const client = createCoston2PublicClient(
    getWebServerConfig().coston2RpcUrl,
  );
  const { fAsset } = await resolveFxrpContracts(client);
  const balanceUBA = await client.readContract({
    address: fAsset,
    abi: ifAssetAbi,
    functionName: "balanceOf",
    args: [getAddress(recipient)],
  });
  return {
    recipient: getAddress(recipient),
    balanceUBA: balanceUBA.toString(),
    source: `${fAsset} balanceOf(${getAddress(recipient)})`,
    timestamp: new Date().toISOString(),
  };
}

export async function getPublicExecutorJob(
  transactionId: string,
): Promise<{ job: PublicExecutorJob | null; reachable: boolean }> {
  const normalized = transactionId.replace(/^0x/i, "").toUpperCase();
  const executorUrl = getWebServerConfig().executorStatusUrl.replace(
    /\/+$/,
    "",
  );
  try {
    const response = await fetch(`${executorUrl}/transactions/${normalized}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) {
      return { job: null, reachable: true };
    }
    if (!response.ok) {
      throw new Error(`Executor status returned HTTP ${response.status}`);
    }
    return {
      job: (await response.json()) as PublicExecutorJob,
      reachable: true,
    };
  } catch {
    return { job: null, reachable: false };
  }
}

export async function getMintProgress(
  transactionId: string,
  recipient: string,
): Promise<MintProgressStatus> {
  const normalized = transactionId.replace(/^0x/i, "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(normalized)) {
    throw new Error("Malformed XRPL transaction identifier");
  }
  const executor = await getPublicExecutorJob(normalized);
  const job = executor.job;
  const executorReachable = executor.reachable;

  const stage: ExecutorStage = job?.stage ?? "waiting_for_executor";
  const presentation = stagePresentation(stage);
  let fxrpBalance: MintProgressStatus["fxrpBalance"];
  if (stage === "minted") {
    fxrpBalance = await readFxrpBalance(recipient);
  }
  return {
    transactionId: normalized,
    stage,
    ...presentation,
    executorReachable,
    attempts: job?.attempts ?? 0,
    updatedAt: job?.updatedAt ?? new Date().toISOString(),
    nextAttemptAt: job?.nextAttemptAt ?? null,
    votingRoundId: job?.attestation?.votingRoundId,
    fdcSubmissionTransactionHash:
      job?.attestation?.submissionTransactionHash,
    flareTransactionHash:
      job?.settlement?.flareTransactionHash ??
      job?.execution?.transactionHash,
    settlement: job?.settlement,
    error: job?.error,
    fxrpBalance,
  };
}
