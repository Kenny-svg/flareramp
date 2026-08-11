import {
  ixrpPaymentVerificationAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import {
  encodeAbiParameters,
  keccak256,
  stringToHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  FdcProofError,
  createFdcProofDependencies,
  decodeXrpPaymentResponse,
  requestPaymentProof,
  validateXrpPaymentProof,
  type ExpectedXrpPayment,
  type FdcProofConfig,
  type FdcProofDependencies,
  type XrpPaymentProof,
} from "./fdcProof";

const PRIVATE_KEY = `0x${"1".repeat(64)}` as Hex;
const PROOF_OWNER = "0x1111111111111111111111111111111111111111";
const TRANSACTION_ID = `0x${"ab".repeat(32)}` as Hex;
const SOURCE = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
const DESTINATION = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const MEMO = "0x1234" as Hex;
const ROUND = 42n;

const config: FdcProofConfig = {
  coston2RpcUrl: "https://rpc.example",
  executorPrivateKey: PRIVATE_KEY,
  verifierUrl: "https://verifier.example/",
  verifierApiKey: "test-api-key",
  daLayerUrl: "https://da.example/",
  prepareTimeoutMs: 100,
  finalizationTimeoutMs: 100,
  proofTimeoutMs: 100,
  initialPollDelayMs: 1,
  maxPollDelayMs: 2,
};

const expected: ExpectedXrpPayment = {
  transactionId: TRANSACTION_ID,
  proofOwner: PROOF_OWNER,
  sourceAddress: SOURCE,
  destinationAddress: DESTINATION,
  amountDrops: 1_000_000n,
  memoData: MEMO,
  destinationTag: 7n,
};

function addressHash(value: string): Hex {
  return keccak256(toHex(value));
}

function responseData(): XrpPaymentProof["data"] {
  return {
    attestationType: stringToHex("XRPPayment", { size: 32 }),
    sourceId: stringToHex("testXRP", { size: 32 }),
    votingRound: ROUND,
    lowestUsedTimestamp: 1_700_000_000n,
    requestBody: {
      transactionId: TRANSACTION_ID,
      proofOwner: PROOF_OWNER,
    },
    responseBody: {
      blockNumber: 10_000n,
      blockTimestamp: 1_700_000_000n,
      sourceAddress: SOURCE,
      sourceAddressHash: addressHash(SOURCE),
      receivingAddressHash: addressHash(DESTINATION),
      intendedReceivingAddressHash: addressHash(DESTINATION),
      spentAmount: 1_000_012n,
      intendedSpentAmount: 1_000_012n,
      receivedAmount: 1_000_000n,
      intendedReceivedAmount: 1_000_000n,
      hasMemoData: true,
      firstMemoData: MEMO,
      hasDestinationTag: true,
      destinationTag: 7n,
      status: 0,
    },
  };
}

function encodedResponse(data = responseData()): Hex {
  const parameter =
    ixrpPaymentVerificationAbi[0].inputs[0].components[1];
  return encodeAbiParameters([parameter], [data]);
}

function dependencies(
  overrides: Partial<FdcProofDependencies> = {},
): FdcProofDependencies {
  return {
    prepareRequest: vi.fn().mockResolvedValue({
      abiEncodedRequest: "0x1234",
    }),
    submitRequest: vi.fn().mockResolvedValue({
      transactionHash: `0x${"cd".repeat(32)}`,
      votingRoundId: ROUND,
    }),
    isFinalized: vi.fn().mockResolvedValue(true),
    retrieveProof: vi.fn().mockResolvedValue({
      proof: [`0x${"ef".repeat(32)}`],
      responseHex: encodedResponse(),
    }),
    sleep: vi.fn().mockResolvedValue(undefined),
    now: vi.fn().mockReturnValue(0),
    ...overrides,
  };
}

describe("XRPPayment proof pipeline", () => {
  it("prepares, submits, finalizes, decodes, and validates a proof", async () => {
    const deps = dependencies();

    const proof = await requestPaymentProof(expected, config, deps);

    expect(proof.data.responseBody.receivedAmount).toBe(1_000_000n);
    expect(deps.prepareRequest).toHaveBeenCalledWith(
      expected,
      expect.any(AbortSignal),
    );
    expect(deps.isFinalized).toHaveBeenCalledWith(ROUND);
  });

  it("rejects a proof whose payment amount differs", () => {
    const proof = {
      merkleProof: [],
      data: {
        ...responseData(),
        responseBody: {
          ...responseData().responseBody,
          receivedAmount: 999n,
        },
      },
    } as XrpPaymentProof;

    expect(() => validateXrpPaymentProof(proof, expected, ROUND)).toThrow(
      expect.objectContaining({ code: "PAYMENT_MISMATCH" }),
    );
  });

  it("times out with backoff while waiting for confirmations", async () => {
    let currentTime = 0;
    const deps = dependencies({
      prepareRequest: vi
        .fn()
        .mockRejectedValue(
          new FdcProofError("VERIFIER_REJECTED", "not confirmed"),
        ),
      now: () => currentTime,
      sleep: async (milliseconds) => {
        currentTime += milliseconds;
      },
    });

    await expect(
      requestPaymentProof(expected, { ...config, prepareTimeoutMs: 3 }, deps),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      message: expect.stringContaining("3 confirmations"),
    });
  });

  it("fails closed on malformed ABI response data", () => {
    expect(() => decodeXrpPaymentResponse("0x1234")).toThrow(
      expect.objectContaining({ code: "MALFORMED_PROOF" }),
    );
  });

  it("uses the live verifier's documented endpoint and X-API-KEY header", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: "VALID", abiEncodedRequest: "0x1234" }),
          { status: 200 },
        ),
      );
    const deps = createFdcProofDependencies(config);

    await deps.prepareRequest(expected, new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://verifier.example/verifier/xrp/XRPPayment/prepareRequest",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": "test-api-key",
        },
      }),
    );
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request?.body)) as {
      requestBody: { transactionId: string; proofOwner: Address };
    };
    expect(body.requestBody).toEqual({
      transactionId: TRANSACTION_ID.slice(2),
      proofOwner: PROOF_OWNER,
    });

    fetchMock.mockRestore();
  });

  it("requests the raw DA Layer proof using a numeric voting round", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            proof: [`0x${"ef".repeat(32)}`],
            response_hex: encodedResponse(),
          }),
          { status: 200 },
        ),
      );
    const deps = createFdcProofDependencies(config);

    const proof = await deps.retrieveProof(
      "0x1234",
      ROUND,
      new AbortController().signal,
    );

    expect(proof?.responseHex).toBe(encodedResponse());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://da.example/api/v1/fdc/proof-by-request-round-raw",
      expect.objectContaining({
        body: JSON.stringify({
          votingRoundId: 42,
          requestBytes: "0x1234",
        }),
      }),
    );

    fetchMock.mockRestore();
  });

  it("retries while the DA Layer has not indexed the attestation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: "attestation request not found" }),
          { status: 400 },
        ),
      );
    const deps = createFdcProofDependencies(config);

    await expect(
      deps.retrieveProof("0x1234", ROUND, new AbortController().signal),
    ).resolves.toBeNull();

    fetchMock.mockRestore();
  });
});
