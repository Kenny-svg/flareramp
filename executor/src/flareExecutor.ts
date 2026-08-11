import {
  iAssetManagerAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import {
  getAddress,
  isAddressEqual,
  parseEventLogs,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { DEFAULT_COSTON2_RPC_URL } from "./config";
import {
  validateXrpPaymentProof,
  type ExpectedXrpPayment,
  type XrpPaymentProof,
} from "./fdcProof";
import { getExecutorClients } from "./flareClients";
import { resolveContractAddress } from "./flareContracts";

export { getExecutorClients } from "./flareClients";

export interface DirectMintingParams {
  proof: XrpPaymentProof;
  expectedPayment: ExpectedXrpPayment;
  executorPrivateKey: Hex;
  coston2RpcUrl?: string;
  onSubmitted?: (
    transactionHash: Hex,
    assetManager: Address,
  ) => void | Promise<void>;
}

export interface SubmittedDirectMinting {
  transactionHash: Hex;
  assetManager: Address;
}

export interface DirectMintingSettlement {
  status: "executed";
  assetManager: Address;
  flareTransactionHash: Hex;
  blockNumber: bigint;
  blockHash: Hex;
  xrplTransactionId: Hex;
  recipient: Address;
  executor: Address;
  mintedAmountUBA: bigint;
  mintingFeeUBA: bigint;
  executorFeeUBA: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
}

export type DirectMintingErrorCode =
  | "PAYMENT_MISMATCH"
  | "SIMULATION_FAILED"
  | "ALREADY_EXECUTED"
  | "SUBMISSION_FAILED"
  | "CHECKPOINT_FAILED"
  | "EXECUTION_REVERTED"
  | "MINTING_DELAYED"
  | "PAYMENT_TOO_SMALL"
  | "UNEXPECTED_OUTCOME";

export class DirectMintingError extends Error {
  constructor(
    public readonly code: DirectMintingErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DirectMintingError";
  }
}

export interface DirectMintingDependencies {
  resolveAssetManager: () => Promise<Address>;
  getCoreVaultAddress: (assetManager: Address) => Promise<string>;
  simulate: (
    assetManager: Address,
    proof: XrpPaymentProof,
  ) => Promise<void>;
  submit: (
    assetManager: Address,
    proof: XrpPaymentProof,
  ) => Promise<Hex>;
  waitForReceipt: (transactionHash: Hex) => Promise<TransactionReceipt>;
}

function errorDescription(error: unknown): string {
  const visited = new Set<unknown>();
  const parts: string[] = [];
  let current: unknown = error;
  while (
    typeof current === "object" &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(current);
    const value = current as Record<string, unknown>;
    for (const key of ["errorName", "shortMessage", "message"]) {
      if (typeof value[key] === "string") parts.push(value[key]);
    }
    current = value.cause;
  }
  return parts.join(" ");
}

function isAlreadyExecutedError(error: unknown): boolean {
  return /PaymentAlreadyConfirmed/i.test(errorDescription(error));
}

export function createDirectMintingDependencies(
  privateKey: Hex,
  rpcUrl = DEFAULT_COSTON2_RPC_URL,
): DirectMintingDependencies {
  const { account, publicClient, walletClient } = getExecutorClients(
    privateKey,
    rpcUrl,
  );

  return {
    resolveAssetManager: () =>
      resolveContractAddress(publicClient, "AssetManagerFXRP"),

    getCoreVaultAddress: (assetManager) =>
      publicClient.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "directMintingPaymentAddress",
      }),

    async simulate(assetManager, proof) {
      await publicClient.simulateContract({
        account,
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "executeDirectMinting",
        args: [proof],
      });
    },

    submit: (assetManager, proof) =>
      walletClient.writeContract({
        account,
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "executeDirectMinting",
        args: [proof],
      }),

    waitForReceipt: (transactionHash) =>
      publicClient.waitForTransactionReceipt({ hash: transactionHash }),
  };
}

export function decodeDirectMintingSettlement(
  receipt: TransactionReceipt,
  transactionHash: Hex,
  assetManager: Address,
  expectedTransactionId: Hex,
): DirectMintingSettlement {
  const events = parseEventLogs({
    abi: iAssetManagerAbi,
    logs: receipt.logs,
    eventName: [
      "DirectMintingExecuted",
      "DirectMintingExecutedToSmartAccount",
      "DirectMintingDelayed",
      "LargeDirectMintingDelayed",
      "DirectMintingPaymentTooSmallForFee",
    ],
    strict: false,
  });

  for (const event of events) {
    if (!isAddressEqual(event.address, assetManager)) continue;

    if (event.eventName === "DirectMintingExecuted") {
      const {
        transactionId,
        targetAddress,
        executor,
        mintedAmountUBA,
        mintingFeeUBA,
        executorFeeUBA,
      } = event.args;
      if (
        typeof transactionId !== "string" ||
        typeof targetAddress !== "string" ||
        typeof executor !== "string" ||
        typeof mintedAmountUBA !== "bigint" ||
        typeof mintingFeeUBA !== "bigint" ||
        typeof executorFeeUBA !== "bigint"
      ) {
        throw new DirectMintingError(
          "UNEXPECTED_OUTCOME",
          "DirectMintingExecuted event is missing required fields",
        );
      }
      if (
        transactionId.toLowerCase() !== expectedTransactionId.toLowerCase()
      ) {
        throw new DirectMintingError(
          "UNEXPECTED_OUTCOME",
          "DirectMintingExecuted contains a different XRPL transaction id",
        );
      }
      return {
        status: "executed",
        assetManager,
        flareTransactionHash: transactionHash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        xrplTransactionId: transactionId as Hex,
        recipient: getAddress(targetAddress),
        executor: getAddress(executor),
        mintedAmountUBA,
        mintingFeeUBA,
        executorFeeUBA,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
      };
    }

    if (
      event.eventName === "DirectMintingDelayed" ||
      event.eventName === "LargeDirectMintingDelayed"
    ) {
      throw new DirectMintingError(
        "MINTING_DELAYED",
        "Direct minting was accepted but delayed by protocol limits",
        undefined,
        {
          transactionId: event.args.transactionId,
          executionAllowedAt: event.args.executionAllowedAt,
          delayType: event.eventName,
        },
      );
    }

    if (event.eventName === "DirectMintingPaymentTooSmallForFee") {
      throw new DirectMintingError(
        "PAYMENT_TOO_SMALL",
        "XRPL payment was consumed by the minimum minting fee",
        undefined,
        {
          transactionId: event.args.transactionId,
          receivedAmountUBA: event.args.receivedAmountUBA,
          minimumMintingFeeUBA: event.args.minimumMintingFeeUBA,
        },
      );
    }

    if (event.eventName === "DirectMintingExecutedToSmartAccount") {
      throw new DirectMintingError(
        "UNEXPECTED_OUTCOME",
        "Payment resolved to a Smart Account flow, which this executor does not support",
      );
    }
  }

  throw new DirectMintingError(
    "UNEXPECTED_OUTCOME",
    "Successful receipt did not contain a direct-mint settlement event",
  );
}

export async function executeDirectMinting(
  params: DirectMintingParams,
  dependencies: DirectMintingDependencies = createDirectMintingDependencies(
    params.executorPrivateKey,
    params.coston2RpcUrl,
  ),
): Promise<DirectMintingSettlement> {
  const { account } = getExecutorClients(
    params.executorPrivateKey,
    params.coston2RpcUrl,
  );
  if (!isAddressEqual(account.address, params.expectedPayment.proofOwner)) {
    throw new DirectMintingError(
      "PAYMENT_MISMATCH",
      "Configured executor does not match the FDC proof owner",
    );
  }

  try {
    validateXrpPaymentProof(
      params.proof,
      params.expectedPayment,
      params.proof.data.votingRound,
    );
  } catch (error) {
    throw new DirectMintingError(
      "PAYMENT_MISMATCH",
      "XRPPayment proof does not match the intended payment",
      error,
    );
  }

  const assetManager = await dependencies.resolveAssetManager();
  const coreVaultAddress =
    await dependencies.getCoreVaultAddress(assetManager);
  if (coreVaultAddress !== params.expectedPayment.destinationAddress) {
    throw new DirectMintingError(
      "PAYMENT_MISMATCH",
      "XRPL payment destination is not the current FXRP Core Vault",
    );
  }

  try {
    await dependencies.simulate(assetManager, params.proof);
  } catch (error) {
    if (isAlreadyExecutedError(error)) {
      throw new DirectMintingError(
        "ALREADY_EXECUTED",
        "XRPL payment has already been executed",
        error,
      );
    }
    throw new DirectMintingError(
      "SIMULATION_FAILED",
      "executeDirectMinting simulation failed; no transaction was signed",
      error,
    );
  }

  let transactionHash: Hex;
  try {
    transactionHash = await dependencies.submit(assetManager, params.proof);
  } catch (error) {
    throw new DirectMintingError(
      "SUBMISSION_FAILED",
      "Failed to submit executeDirectMinting",
      error,
    );
  }
  try {
    await params.onSubmitted?.(transactionHash, assetManager);
  } catch (error) {
    throw new DirectMintingError(
      "CHECKPOINT_FAILED",
      "Transaction was submitted but its durable checkpoint failed",
      error,
      { transactionHash, assetManager },
    );
  }

  const receipt = await dependencies.waitForReceipt(transactionHash);
  if (receipt.status !== "success") {
    throw new DirectMintingError(
      "EXECUTION_REVERTED",
      "executeDirectMinting transaction reverted",
      undefined,
      {
        transactionHash,
        blockNumber: receipt.blockNumber,
      },
    );
  }

  const settlement = decodeDirectMintingSettlement(
    receipt,
    transactionHash,
    assetManager,
    params.proof.data.requestBody.transactionId,
  );
  if (!isAddressEqual(settlement.executor, account.address)) {
    throw new DirectMintingError(
      "UNEXPECTED_OUTCOME",
      "Settlement event executor does not match the configured executor",
    );
  }
  return settlement;
}

export async function recoverSubmittedDirectMinting(
  submission: SubmittedDirectMinting,
  proof: XrpPaymentProof,
  executorPrivateKey: Hex,
  coston2RpcUrl?: string,
  dependencies: DirectMintingDependencies = createDirectMintingDependencies(
    executorPrivateKey,
    coston2RpcUrl,
  ),
): Promise<DirectMintingSettlement> {
  const { account } = getExecutorClients(executorPrivateKey, coston2RpcUrl);
  const receipt = await dependencies.waitForReceipt(submission.transactionHash);
  if (receipt.status !== "success") {
    throw new DirectMintingError(
      "EXECUTION_REVERTED",
      "Previously submitted executeDirectMinting transaction reverted",
      undefined,
      {
        transactionHash: submission.transactionHash,
        blockNumber: receipt.blockNumber,
      },
    );
  }
  const settlement = decodeDirectMintingSettlement(
    receipt,
    submission.transactionHash,
    submission.assetManager,
    proof.data.requestBody.transactionId,
  );
  if (!isAddressEqual(settlement.executor, account.address)) {
    throw new DirectMintingError(
      "UNEXPECTED_OUTCOME",
      "Recovered settlement executor does not match the configured executor",
    );
  }
  return settlement;
}
