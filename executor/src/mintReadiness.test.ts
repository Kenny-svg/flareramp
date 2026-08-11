import { getAddress, zeroAddress, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  calculateDirectMintQuote,
  checkMintReadiness,
  type DirectMintParameters,
  type MintReadinessDependencies,
  type MintReadinessRequest,
} from "./mintReadiness";

const NOW = Date.parse("2026-08-10T08:00:00.000Z");
const RECIPIENT = getAddress(
  "0x1111111111111111111111111111111111111111",
);
const EXECUTOR = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const ASSET_MANAGER = getAddress(
  "0x3333333333333333333333333333333333333333",
);
const FTSO = getAddress(
  "0x4444444444444444444444444444444444444444",
);
const TAG_MANAGER = getAddress(
  "0x5555555555555555555555555555555555555555",
);
const CORE_VAULT = "rCoreVault11111111111111111111111";

const parameters: DirectMintParameters = {
  assetManager: ASSET_MANAGER,
  coreVaultAddress: CORE_VAULT,
  minimumMintingFeeUBA: 100_000n,
  mintingFeeBIPS: 25n,
  executorFeeUBA: 100_000n,
  othersCanExecuteAfterSeconds: 300n,
};

function directMemo(recipient: Address, executor?: Address): Hex {
  return executor
    ? (`0x4642505266410021${recipient.slice(2)}${executor.slice(2)}` as Hex)
    : (`0x464250526641001800000000${recipient.slice(2)}` as Hex);
}

function dependencies(
  overrides: Partial<MintReadinessDependencies> = {},
): MintReadinessDependencies {
  return {
    readFtsoFeed: async () => ({
      value: 250n,
      decimals: 2,
      timestamp: BigInt(NOW / 1_000 - 4),
      contractAddress: FTSO,
    }),
    readDirectMintParameters: async () => parameters,
    readMintingTag: async () => ({
      recipient: RECIPIENT,
      allowedExecutor: zeroAddress,
      contractAddress: TAG_MANAGER,
    }),
    readExecutorBalance: async () => 2_000_000_000_000_000_000n,
    validateXrplAddress: async () => true,
    checkFdcVerifier: async () => ({
      available: true,
      source: "https://verifier.test/verifier/xrp/XRPPayment/prepareRequest",
    }),
    now: () => NOW,
    ...overrides,
  };
}

function request(
  overrides: Partial<MintReadinessRequest> = {},
): MintReadinessRequest {
  return {
    sourceXrplAddress: "rValidSourceAddress",
    destinationXrplAddress: CORE_VAULT,
    amountDrops: 1_000_000n,
    recipient: RECIPIENT,
    executorAddress: EXECUTOR,
    memoData: directMemo(RECIPIENT, EXECUTOR),
    ...overrides,
  };
}

describe("calculateDirectMintQuote", () => {
  it("uses the minimum fee floor and reports exact USD value", () => {
    expect(
      calculateDirectMintQuote(1_000_000n, parameters, {
        value: 250n,
        decimals: 2,
      }),
    ).toEqual({
      paymentAmountUBA: 1_000_000n,
      percentageMintingFeeUBA: 2_500n,
      mintingFeeUBA: 100_000n,
      executorFeeUBA: 100_000n,
      expectedFXRPUBA: 800_000n,
      paymentUsd: "2.5",
    });
  });

  it("caps fees at the payment instead of returning a negative mint", () => {
    expect(calculateDirectMintQuote(50_000n, parameters)).toMatchObject({
      mintingFeeUBA: 50_000n,
      executorFeeUBA: 0n,
      expectedFXRPUBA: 0n,
      paymentUsd: null,
    });
  });
});

describe("checkMintReadiness", () => {
  it("returns sourced pass checks and the protocol-derived quote", async () => {
    const result = await checkMintReadiness(request(), dependencies());

    expect(result.quote?.expectedFXRPUBA).toBe(800_000n);
    expect(result.ftso).toMatchObject({
      value: 250n,
      decimals: 2,
      timestamp: BigInt(NOW / 1_000 - 4),
    });
    expect(result.parameters).toEqual(parameters);
    expect(result.checks).toHaveLength(7);
    expect(result.checks.every((item) => item.status === "pass")).toBe(
      true,
    );
    expect(
      result.checks.every(
        (item) => item.source.length > 0 && item.timestamp.length > 0,
      ),
    ).toBe(true);
  });

  it("fails stale data, invalid fields, and a payment below the fee floor", async () => {
    const result = await checkMintReadiness(
      request({
        sourceXrplAddress: "not-an-address",
        destinationXrplAddress: "rWrongVault",
        amountDrops: 50_000n,
        memoData: "0x1234",
      }),
      dependencies({
        validateXrplAddress: async () => false,
        readFtsoFeed: async () => ({
          value: 250n,
          decimals: 2,
          timestamp: BigInt(NOW / 1_000 - 61),
          contractAddress: FTSO,
        }),
        checkFdcVerifier: async () => ({
          available: false,
          source: "https://verifier.test",
        }),
        readExecutorBalance: async () => 0n,
      }),
    );

    expect(
      result.checks
        .filter((item) => item.status === "fail")
        .map((item) => item.id),
    ).toEqual([
      "ftso_xrp_usd",
      "xrpl_source_address",
      "core_vault_destination",
      "payment_amount",
      "routing_encoding",
      "fdc_verifier",
    ]);
    expect(
      result.checks.find((item) => item.id === "executor_availability")
        ?.status,
    ).toBe("warn");
  });

  it("validates minting-tag recipient and executor restrictions", async () => {
    const otherExecutor = getAddress(
      "0x6666666666666666666666666666666666666666",
    );
    const result = await checkMintReadiness(
      request({
        memoData: undefined,
        destinationTag: 123n,
      }),
      dependencies({
        readMintingTag: async () => ({
          recipient: RECIPIENT,
          allowedExecutor: otherExecutor,
          contractAddress: TAG_MANAGER,
        }),
      }),
    );

    expect(
      result.checks.find((item) => item.id === "routing_encoding")?.status,
    ).toBe("pass");
    expect(
      result.checks.find((item) => item.id === "executor_availability"),
    ).toMatchObject({
      status: "fail",
      message: "Configured operator is not allowed for this minting tag",
    });
  });

  it("returns explicit failed checks when protocol sources are unavailable", async () => {
    const result = await checkMintReadiness(
      request(),
      dependencies({
        readFtsoFeed: async () => {
          throw new Error("RPC unavailable");
        },
        readDirectMintParameters: async () => {
          throw new Error("RPC unavailable");
        },
        checkFdcVerifier: async () => {
          throw new Error("timeout");
        },
      }),
    );

    expect(result.ftso).toBeNull();
    expect(result.parameters).toBeNull();
    expect(result.quote).toBeNull();
    expect(
      result.checks
        .filter((item) => item.status === "fail")
        .map((item) => item.id),
    ).toEqual([
      "ftso_xrp_usd",
      "core_vault_destination",
      "fdc_verifier",
    ]);
  });
});
