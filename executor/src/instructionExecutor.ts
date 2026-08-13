import {
  iMasterAccountControllerAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import {
  getAddress,
  parseEventLogs,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { DEFAULT_COSTON2_RPC_URL } from "./config";
import type { PaymentProof } from "./fdcPaymentProof";
import { getExecutorClients } from "./flareClients";
import { resolveContractAddress } from "./flareContracts";
import { truncatePublicErrorMessage } from "./flareExecutor";

export type InstructionExecutorErrorCode =
  | "ALREADY_EXECUTED"
  | "SIMULATION_FAILED"
  | "SUBMISSION_FAILED"
  | "EXECUTION_REVERTED"
  | "UNEXPECTED_OUTCOME";

export class InstructionExecutorError extends Error {
  constructor(
    public readonly code: InstructionExecutorErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InstructionExecutorError";
  }
}

export interface InstructionSettlement {
  status: "instruction_executed";
  controller: Address;
  flareTransactionHash: Hex;
  blockNumber: bigint;
  blockHash: Hex;
  xrplTransactionId: Hex;
  personalAccount: Address;
  xrplOwner: string;
  instructionId: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
}

export interface InstructionExecutorDependencies {
  resolveController: () => Promise<Address>;
  isTransactionUsed: (
    controller: Address,
    transactionId: Hex,
  ) => Promise<boolean>;
  simulate: (
    controller: Address,
    proof: PaymentProof,
    xrplAddress: string,
  ) => Promise<void>;
  submit: (
    controller: Address,
    proof: PaymentProof,
    xrplAddress: string,
  ) => Promise<Hex>;
  waitForReceipt: (transactionHash: Hex) => Promise<TransactionReceipt>;
}

function errorDescription(error: unknown): string {
  const visited = new Set<unknown>();
  let current: unknown = error;
  let shortMessage: string | undefined;
  let message: string | undefined;
  while (
    typeof current === "object" &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(current);
    const value = current as Record<string, unknown>;
    if (!shortMessage && typeof value.shortMessage === "string") {
      shortMessage = value.shortMessage;
    }
    if (!message && typeof value.message === "string") {
      message = value.message;
    }
    current = value.cause;
  }
  return truncatePublicErrorMessage(shortMessage || message || "unknown error");
}

function isAlreadyExecutedError(error: unknown): boolean {
  return /TransactionAlreadyExecuted|already.*(used|executed)/i.test(
    errorDescription(error),
  );
}

export function createInstructionExecutorDependencies(
  privateKey: Hex,
  rpcUrl = DEFAULT_COSTON2_RPC_URL,
): InstructionExecutorDependencies {
  const { account, publicClient, walletClient } = getExecutorClients(
    privateKey,
    rpcUrl,
  );

  return {
    async resolveController() {
      return resolveContractAddress(publicClient, "MasterAccountController");
    },
    async isTransactionUsed(controller, transactionId) {
      return publicClient.readContract({
        address: controller,
        abi: iMasterAccountControllerAbi,
        functionName: "isTransactionIdUsed",
        args: [transactionId],
      });
    },
    async simulate(controller, proof, xrplAddress) {
      await publicClient.simulateContract({
        account,
        address: controller,
        abi: iMasterAccountControllerAbi,
        functionName: "executeInstruction",
        args: [proof, xrplAddress],
      });
    },
    async submit(controller, proof, xrplAddress) {
      const { request } = await publicClient.simulateContract({
        account,
        address: controller,
        abi: iMasterAccountControllerAbi,
        functionName: "executeInstruction",
        args: [proof, xrplAddress],
      });
      return walletClient.writeContract(request);
    },
    waitForReceipt(transactionHash) {
      return publicClient.waitForTransactionReceipt({ hash: transactionHash });
    },
  };
}

export function decodeInstructionSettlement(
  receipt: TransactionReceipt,
  controller: Address,
  xrplTransactionId: Hex,
): InstructionSettlement {
  const logs = parseEventLogs({
    abi: iMasterAccountControllerAbi,
    logs: receipt.logs,
    eventName: "InstructionExecuted",
  });
  const match = logs.find(
    (entry) =>
      entry.args.transactionId?.toLowerCase() ===
      xrplTransactionId.toLowerCase(),
  );
  if (!match?.args.personalAccount || match.args.instructionId === undefined) {
    throw new InstructionExecutorError(
      "UNEXPECTED_OUTCOME",
      "executeInstruction receipt is missing InstructionExecuted",
    );
  }
  return {
    status: "instruction_executed",
    controller: getAddress(controller),
    flareTransactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    xrplTransactionId,
    personalAccount: getAddress(match.args.personalAccount),
    xrplOwner: match.args.xrplOwner ?? "",
    instructionId: BigInt(match.args.instructionId),
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice ?? 0n,
  };
}

export async function executeSmartAccountInstruction(
  params: {
    proof: PaymentProof;
    xrplAddress: string;
    transactionId: Hex;
    executorPrivateKey: Hex;
    coston2RpcUrl?: string;
    onSubmitted?: (
      transactionHash: Hex,
      controller: Address,
    ) => void | Promise<void>;
  },
  dependencies: InstructionExecutorDependencies = createInstructionExecutorDependencies(
    params.executorPrivateKey,
    params.coston2RpcUrl,
  ),
): Promise<InstructionSettlement> {
  const controller = await dependencies.resolveController();
  const txId = (
    params.transactionId.startsWith("0x")
      ? params.transactionId
      : `0x${params.transactionId}`
  ).toLowerCase() as Hex;

  if (await dependencies.isTransactionUsed(controller, txId)) {
    throw new InstructionExecutorError(
      "ALREADY_EXECUTED",
      "XRPL instruction payment has already been executed",
    );
  }

  try {
    await dependencies.simulate(controller, params.proof, params.xrplAddress);
  } catch (error) {
    if (isAlreadyExecutedError(error)) {
      throw new InstructionExecutorError(
        "ALREADY_EXECUTED",
        "XRPL instruction payment has already been executed",
        error,
      );
    }
    throw new InstructionExecutorError(
      "SIMULATION_FAILED",
      `executeInstruction simulation failed; no transaction was signed: ${errorDescription(error)}`,
      error,
    );
  }

  let transactionHash: Hex;
  try {
    transactionHash = await dependencies.submit(
      controller,
      params.proof,
      params.xrplAddress,
    );
  } catch (error) {
    throw new InstructionExecutorError(
      "SUBMISSION_FAILED",
      `executeInstruction submission failed: ${errorDescription(error)}`,
      error,
    );
  }

  await params.onSubmitted?.(transactionHash, controller);
  const receipt = await dependencies.waitForReceipt(transactionHash);
  if (receipt.status !== "success") {
    throw new InstructionExecutorError(
      "EXECUTION_REVERTED",
      "executeInstruction transaction reverted",
      undefined,
      { transactionHash, controller },
    );
  }
  return decodeInstructionSettlement(receipt, controller, txId);
}
