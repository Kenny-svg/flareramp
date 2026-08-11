import "server-only";

import { resolve } from "node:path";
import dotenv from "dotenv";
import {
  checkMintReadiness,
  createMintReadinessDependencies,
  type MintReadinessResult,
} from "flareramp-executor/mint-readiness";
import {
  buildDirectMintingMemo,
  createXamanDirectMintDependencies,
  createXamanDirectMintService,
  type DirectMintPaymentTemplate,
} from "flareramp-executor/xaman-direct-mint";
import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getWebServerConfig } from "./config";

for (const envPath of [
  resolve(process.cwd(), "../executor/.env"),
  resolve(process.cwd(), "executor/.env"),
]) {
  dotenv.config({ path: envPath });
}

export interface MintReviewInput {
  sourceAddress: string;
  recipient: string;
  amountXrp: string;
}

export interface MintReview {
  checkedAt: string;
  smartAccountRequired: false;
  path: "Core Vault direct mint";
  transaction: {
    network: "XRPL Testnet";
    sourceAddress: string;
    destination: string;
    amountXrp: string;
    amountDrops: string;
    recipient: Address;
    executorAddress: Address;
    memoData: Hex;
  };
  fees: {
    mintingFeeDrops: string;
    executorFeeDrops: string;
    expectedFxrpDrops: string;
    paymentUsd: string | null;
  };
  ftso: {
    value: string;
    decimals: number;
    timestamp: string;
  } | null;
  checks: Array<{
    id: string;
    status: "pass" | "warn" | "fail";
    message: string;
    source: string;
    timestamp: string;
  }>;
}

function executorAddress(): Address {
  const configured = process.env.EXECUTOR_ADDRESS?.trim();
  if (configured) return getAddress(configured);
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error(
      "EXECUTOR_ADDRESS is required (or set the existing server-only EXECUTOR_PRIVATE_KEY)",
    );
  }
  return privateKeyToAccount(privateKey as Hex).address;
}

export function xrpToDrops(amountXrp: string): bigint {
  const match = /^([0-9]+)(?:\.([0-9]{1,6}))?$/.exec(amountXrp.trim());
  if (!match) {
    throw new Error("Amount must be a positive XRP value with at most 6 decimals");
  }
  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(6, "0");
  const drops = whole * 1_000_000n + BigInt(fraction || "0");
  if (drops <= 0n) throw new Error("Amount must be greater than zero");
  return drops;
}

function readinessDependencies() {
  const config = getWebServerConfig();
  return createMintReadinessDependencies({
    rpcUrl: config.coston2RpcUrl,
    verifierUrl: config.verifierUrl,
    verifierApiKey: config.verifierApiKey,
  });
}

function toReview(
  result: MintReadinessResult,
  amountXrp: string,
  executor: Address,
): MintReview {
  if (!result.parameters || !result.quote || !result.ftso) {
    throw new Error("Live protocol data is incomplete; signing is disabled");
  }
  return {
    checkedAt: result.checkedAt,
    smartAccountRequired: false,
    path: "Core Vault direct mint",
    transaction: {
      network: "XRPL Testnet",
      sourceAddress: result.request.sourceXrplAddress,
      destination: result.parameters.coreVaultAddress,
      amountXrp,
      amountDrops: result.request.amountDrops.toString(),
      recipient: result.request.recipient,
      executorAddress: executor,
      memoData: result.request.memoData!,
    },
    fees: {
      mintingFeeDrops: result.quote.mintingFeeUBA.toString(),
      executorFeeDrops: result.quote.executorFeeUBA.toString(),
      expectedFxrpDrops: result.quote.expectedFXRPUBA.toString(),
      paymentUsd: result.quote.paymentUsd,
    },
    ftso: {
      value: result.ftso.value.toString(),
      decimals: result.ftso.decimals,
      timestamp: new Date(Number(result.ftso.timestamp) * 1_000).toISOString(),
    },
    checks: result.checks,
  };
}

export async function createMintReview(
  input: MintReviewInput,
): Promise<MintReview> {
  const amountDrops = xrpToDrops(input.amountXrp);
  const recipient = getAddress(input.recipient);
  const executor = executorAddress();
  const dependencies = readinessDependencies();
  const parameters = await dependencies.readDirectMintParameters();
  const memoData = buildDirectMintingMemo(recipient, executor);
  const result = await checkMintReadiness(
    {
      sourceXrplAddress: input.sourceAddress.trim(),
      destinationXrplAddress: parameters.coreVaultAddress,
      amountDrops,
      recipient,
      executorAddress: executor,
      memoData,
    },
    dependencies,
  );
  return toReview(result, input.amountXrp.trim(), executor);
}

export function assertSigningReady(review: MintReview): void {
  const failed = review.checks.filter((check) => check.status === "fail");
  if (failed.length > 0) {
    throw new Error(
      `Signing blocked: ${failed.map((check) => check.message).join("; ")}`,
    );
  }
}

export function paymentTemplateFromReview(
  review: MintReview,
): DirectMintPaymentTemplate {
  return {
    sourceAddress: review.transaction.sourceAddress,
    coreVaultAddress: review.transaction.destination,
    amountDrops: review.transaction.amountDrops,
    recipient: review.transaction.recipient,
    executorAddress: review.transaction.executorAddress,
    memoData: review.transaction.memoData,
  };
}

export function getXamanDirectMintService() {
  const config = getWebServerConfig();
  return createXamanDirectMintService(
    createXamanDirectMintDependencies({
      apiKey: config.xamanApiKey,
      apiSecret: config.xamanApiSecret,
      xrplWssUrl: config.xrplWssUrl,
    }),
  );
}
