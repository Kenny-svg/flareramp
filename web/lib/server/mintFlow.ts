import "server-only";

import { resolve } from "node:path";
import dotenv from "dotenv";
import {
  iMasterAccountControllerAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
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
import {
  getAddress,
  isAddress,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildFeCustomInstructionMemo,
  buildPackedUserOperation,
  buildVaultDepositCalls,
  encodePackedUserOperation,
  hashPackedUserOperation,
} from "../customInstruction";
import {
  getFxrpTokenAddress,
  getMasterAccountControllerAddress,
  getPublicClient,
} from "../contracts";
import {
  destinationLabel,
  isVaultDestination,
  vaultDeploymentFor,
  type MintDestinationKind,
} from "../mintDestination";
import { getWebServerConfig } from "./config";

for (const envPath of [
  resolve(process.cwd(), "../executor/.env"),
  resolve(process.cwd(), "executor/.env"),
]) {
  dotenv.config({ path: envPath });
}

export interface MintReviewInput {
  sourceAddress: string;
  recipient?: string;
  amountXrp: string;
  destination?: MintDestinationKind;
  /**
   * Vault destinations only: address credited with the ERC-4626 vault shares.
   * Defaults to the sender's Personal Account. Committed inside the signed
   * memo, so it cannot be changed after the XRPL payment is signed.
   */
  shareReceiver?: string;
}

export type MintPath =
  | "Core Vault direct mint"
  | "Core Vault mint + Firelight deposit"
  | "Core Vault mint + Upshift deposit";

export interface MintReview {
  checkedAt: string;
  smartAccountRequired: boolean;
  destination: MintDestinationKind;
  path: MintPath;
  transaction: {
    network: "XRPL Testnet";
    sourceAddress: string;
    destination: string;
    amountXrp: string;
    amountDrops: string;
    recipient: Address;
    executorAddress: Address;
    memoData: Hex;
    vaultAddress?: Address;
    personalAccount?: Address;
    /** Vault destinations only: address credited with the vault shares. */
    shareReceiver?: Address;
    /** False when the user directed shares away from their Personal Account. */
    shareReceiverIsPersonalAccount?: boolean;
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
  /** Present for vault destinations — register with the executor before/after sign. */
  userOpData?: Hex;
  userOpHash?: Hex;
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

function pathFor(destination: MintDestinationKind): MintPath {
  if (destination === "firelight") return "Core Vault mint + Firelight deposit";
  if (destination === "upshift") return "Core Vault mint + Upshift deposit";
  return "Core Vault direct mint";
}

function toReview(
  result: MintReadinessResult,
  amountXrp: string,
  executor: Address,
  destination: MintDestinationKind,
  extras?: {
    userOpData?: Hex;
    userOpHash?: Hex;
    vaultAddress?: Address;
    personalAccount?: Address;
    shareReceiver?: Address;
    shareReceiverIsPersonalAccount?: boolean;
  },
): MintReview {
  if (!result.parameters || !result.quote || !result.ftso) {
    throw new Error("Live protocol data is incomplete; signing is disabled");
  }
  return {
    checkedAt: result.checkedAt,
    smartAccountRequired: isVaultDestination(destination),
    destination,
    path: pathFor(destination),
    transaction: {
      network: "XRPL Testnet",
      sourceAddress: result.request.sourceXrplAddress,
      destination: result.parameters.coreVaultAddress,
      amountXrp,
      amountDrops: result.request.amountDrops.toString(),
      recipient: result.request.recipient,
      executorAddress: executor,
      memoData: result.request.memoData!,
      vaultAddress: extras?.vaultAddress,
      personalAccount: extras?.personalAccount,
      shareReceiver: extras?.shareReceiver,
      shareReceiverIsPersonalAccount: extras?.shareReceiverIsPersonalAccount,
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
    userOpData: extras?.userOpData,
    userOpHash: extras?.userOpHash,
    checks: result.checks,
  };
}

/**
 * Headroom subtracted from the predicted mint before it is baked into the
 * vault deposit. See the rationale at the call site: this buys immunity to an
 * atomic revert at the cost of a few UBA of dust.
 */
export const VAULT_DEPOSIT_HEADROOM_BIPS = 25n;

/**
 * Resolves the ERC-4626 share recipient, defaulting to the Personal Account.
 *
 * Validation is strict and happens here rather than at the edge because the
 * result is committed inside keccak256(userOp) in the signed memo: a bad
 * address cannot be corrected once the XRPL payment is signed, and the
 * executor will faithfully execute whatever was committed.
 */
export function resolveShareReceiver(
  requested: string | undefined,
  personalAccount: Address,
): Address {
  const trimmed = requested?.trim();
  if (!trimmed) return personalAccount;

  // Deliberately NOT getAddress() alone: viem re-checksums rather than
  // rejecting, so a single mistyped character in a mixed-case address yields a
  // *different valid address* and the shares go somewhere unrecoverable. An
  // all-lowercase address carries no checksum to verify, so it is accepted and
  // normalised; a mixed-case one must checksum correctly.
  const hasMixedCase =
    trimmed !== trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase();
  const valid = hasMixedCase
    ? isAddress(trimmed, { strict: true })
    : isAddress(trimmed, { strict: false });
  if (!valid) {
    throw new Error(
      hasMixedCase
        ? "Vault share recipient failed its address checksum — re-copy the address"
        : "Vault share recipient must be a valid Coston2 address",
    );
  }

  const normalized = getAddress(trimmed);
  if (normalized === zeroAddress) {
    throw new Error("Vault share recipient cannot be the zero address");
  }
  return normalized;
}

async function resolvePersonalAccount(xrplAddress: string): Promise<Address> {
  const client = getPublicClient("coston2");
  const controller = await getMasterAccountControllerAddress("coston2");
  const personalAccount = await client.readContract({
    address: controller,
    abi: iMasterAccountControllerAbi,
    functionName: "getPersonalAccount",
    args: [xrplAddress],
  });
  if (!personalAccount || personalAccount === zeroAddress) {
    throw new Error(
      "Could not resolve a Smart Account personal account for this XRPL address",
    );
  }
  return getAddress(personalAccount);
}

async function resolveMemoNonce(personalAccount: Address): Promise<bigint> {
  const client = getPublicClient("coston2");
  const controller = await getMasterAccountControllerAddress("coston2");
  return client.readContract({
    address: controller,
    abi: iMasterAccountControllerAbi,
    functionName: "getNonce",
    args: [personalAccount],
  });
}

export async function createMintReview(
  input: MintReviewInput,
): Promise<MintReview> {
  const destination: MintDestinationKind = input.destination ?? "wallet";
  const amountDrops = xrpToDrops(input.amountXrp);
  const executor = executorAddress();
  const dependencies = readinessDependencies();
  const parameters = await dependencies.readDirectMintParameters();
  const sourceAddress = input.sourceAddress.trim();

  if (!isVaultDestination(destination)) {
    if (!input.recipient?.trim()) {
      throw new Error("Coston2 FXRP recipient is required for wallet minting");
    }
    const recipient = getAddress(input.recipient);
    const memoData = buildDirectMintingMemo(recipient, executor);
    const result = await checkMintReadiness(
      {
        sourceXrplAddress: sourceAddress,
        destinationXrplAddress: parameters.coreVaultAddress,
        amountDrops,
        recipient,
        executorAddress: executor,
        memoData,
      },
      dependencies,
    );
    return toReview(result, input.amountXrp.trim(), executor, destination);
  }

  const vault = vaultDeploymentFor(destination);
  const personalAccount = await resolvePersonalAccount(sourceAddress);
  const nonce = await resolveMemoNonce(personalAccount);
  const fxrpToken = await getFxrpTokenAddress("coston2");

  // Fee quote needs a provisional readiness pass with a dummy wallet memo first
  // so we know expected FXRP; build vault userOp from that quote.
  const provisionalMemo = buildDirectMintingMemo(personalAccount, executor);
  const provisional = await checkMintReadiness(
    {
      sourceXrplAddress: sourceAddress,
      destinationXrplAddress: parameters.coreVaultAddress,
      amountDrops,
      recipient: personalAccount,
      executorAddress: executor,
      memoData: provisionalMemo,
    },
    dependencies,
  );
  if (!provisional.quote || !provisional.parameters) {
    throw new Error("Live protocol data is incomplete; signing is disabled");
  }

  // The memo commits keccak256(userOp) before the mint executes, so the amount
  // baked into approve/deposit is a *prediction* from the fee quote. That quote
  // is plain arithmetic over mintingFeeBIPS / minimumMintingFeeUBA /
  // executorFeeUBA read at quote time and models no AMG rounding, so the real
  // minted amount can land fractionally under it. Because the 0xFE path is
  // atomic, a deposit that tries to pull more than the Personal Account holds
  // reverts the entire mint into 0xE0 recovery.
  //
  // Depositing a hair under the prediction trades a few UBA of dust left in the
  // Personal Account for immunity to that whole failure class. The proper fix
  // is a Zap contract reading FXRP.balanceOf(msg.sender) at execution time, so
  // no amount has to be predicted at all — tracked as follow-up work.
  const expectedFXRP = provisional.quote.expectedFXRPUBA;
  if (expectedFXRP <= 0n) {
    throw new Error("Expected FXRP after fees is zero; increase the payment");
  }
  const depositAmount =
    expectedFXRP - (expectedFXRP * VAULT_DEPOSIT_HEADROOM_BIPS) / 10_000n;
  if (depositAmount <= 0n) {
    throw new Error(
      "Payment is too small to cover the vault deposit headroom; increase the payment",
    );
  }

  const shareReceiver = resolveShareReceiver(input.shareReceiver, personalAccount);
  const calls = buildVaultDepositCalls({
    protocol: vault.protocol,
    fxrpToken,
    vault: vault.vaultAddress,
    personalAccount,
    amountUBA: depositAmount,
    shareReceiver,
  });
  const userOp = buildPackedUserOperation({
    sender: personalAccount,
    nonce,
    calls,
  });
  const userOpData = encodePackedUserOperation(userOp);
  const userOpHash = hashPackedUserOperation(userOp);
  const memoData = buildFeCustomInstructionMemo({
    executorFeeUBA: provisional.parameters.executorFeeUBA,
    userOpHash,
  });

  const result = await checkMintReadiness(
    {
      sourceXrplAddress: sourceAddress,
      destinationXrplAddress: parameters.coreVaultAddress,
      amountDrops,
      recipient: personalAccount,
      executorAddress: executor,
      memoData,
    },
    dependencies,
  );

  // Annotate destination choice in checks for the UI.
  const shareReceiverIsPersonalAccount = shareReceiver === personalAccount;
  result.checks.push({
    id: "mint_destination",
    status: "pass",
    message: `${destinationLabel(destination)} via Smart Account ${personalAccount}`,
    source: vault.vaultAddress,
    timestamp: result.checkedAt,
  });
  // Surfaced as its own check because it is irreversible once signed: the
  // recipient is committed in the memo hash, not chosen at execution time.
  result.checks.push({
    id: "vault_share_recipient",
    // `warn` rather than `pass` when redirected: it does not block signing
    // (only `fail` does), but it renders prominently and expands by default,
    // which is what an irreversible choice deserves.
    status: shareReceiverIsPersonalAccount ? "pass" : "warn",
    message: shareReceiverIsPersonalAccount
      ? `Vault shares credited to your Smart Account ${personalAccount}`
      : `Vault shares credited to ${shareReceiver} — not your Smart Account. This is committed in the signed memo and cannot be changed afterwards.`,
    source: vault.vaultAddress,
    timestamp: result.checkedAt,
  });
  result.checks.push({
    id: "vault_deposit_amount",
    status: "pass",
    message: `Depositing ${depositAmount} UBA of an expected ${expectedFXRP} UBA; the ${
      expectedFXRP - depositAmount
    } UBA difference stays in the Smart Account so rounding cannot revert the mint`,
    source: vault.vaultAddress,
    timestamp: result.checkedAt,
  });

  return toReview(result, input.amountXrp.trim(), executor, destination, {
    userOpData,
    userOpHash,
    vaultAddress: vault.vaultAddress,
    personalAccount,
    shareReceiver,
    shareReceiverIsPersonalAccount,
  });
}

export function assertSigningReady(review: MintReview): void {
  const failed = review.checks.filter((check) => check.status === "fail");
  if (failed.length > 0) {
    throw new Error(
      `Signing blocked: ${failed.map((check) => check.message).join("; ")}`,
    );
  }
  if (isVaultDestination(review.destination) && !review.userOpData) {
    throw new Error("Vault mint is missing the Smart Accounts user operation");
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

/** Push userOp bytes to the executor so Prove can call executeDirectMintingWithData. */
export async function registerUserOpWithExecutor(params: {
  memoHash: Hex;
  userOpData: Hex;
  sourceAddress: string;
}): Promise<void> {
  const base = getWebServerConfig().executorStatusUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/userops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memoHash: params.memoHash,
      userOpData: params.userOpData,
      sourceAddress: params.sourceAddress,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error ??
        `Executor rejected userOp registration (HTTP ${response.status})`,
    );
  }
}
