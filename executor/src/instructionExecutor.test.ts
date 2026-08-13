import { describe, expect, it, vi } from "vitest";
import {
  InstructionExecutorError,
  executeSmartAccountInstruction,
  type InstructionExecutorDependencies,
} from "./instructionExecutor";
import type { PaymentProof } from "./fdcPaymentProof";

const CONTROLLER = "0x1111111111111111111111111111111111111111";
const TX = `0x${"ab".repeat(32)}` as const;
const HASH = `0x${"cd".repeat(32)}` as const;

function deps(
  overrides: Partial<InstructionExecutorDependencies> = {},
): InstructionExecutorDependencies {
  return {
    resolveController: async () => CONTROLLER,
    isTransactionUsed: async () => false,
    simulate: async () => undefined,
    submit: async () => HASH,
    waitForReceipt: async () =>
      ({
        status: "success",
        transactionHash: HASH,
        blockNumber: 1n,
        blockHash: `0x${"11".repeat(32)}`,
        gasUsed: 100n,
        effectiveGasPrice: 1n,
        logs: [],
      }) as never,
    ...overrides,
  };
}

describe("executeSmartAccountInstruction", () => {
  it("fails closed when the payment was already executed", async () => {
    await expect(
      executeSmartAccountInstruction(
        {
          proof: {} as PaymentProof,
          xrplAddress: "rSource",
          transactionId: TX,
          executorPrivateKey: `0x${"11".repeat(32)}`,
        },
        deps({ isTransactionUsed: async () => true }),
      ),
    ).rejects.toMatchObject({
      code: "ALREADY_EXECUTED",
    } satisfies Partial<InstructionExecutorError>);
  });

  it("does not submit when simulation fails", async () => {
    const submit = vi.fn(async () => HASH);
    await expect(
      executeSmartAccountInstruction(
        {
          proof: {} as PaymentProof,
          xrplAddress: "rSource",
          transactionId: TX,
          executorPrivateKey: `0x${"11".repeat(32)}`,
        },
        deps({
          simulate: async () => {
            throw new Error("boom");
          },
          submit,
        }),
      ),
    ).rejects.toMatchObject({ code: "SIMULATION_FAILED" });
    expect(submit).not.toHaveBeenCalled();
  });
});
