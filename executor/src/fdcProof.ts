import {
  iFdcHubAbi,
  iFdcRequestFeeConfigurationsAbi,
  iRelayAbi,
  ixrpPaymentVerificationAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import {
  decodeAbiParameters,
  getAddress,
  isAddressEqual,
  isHex,
  keccak256,
  stringToHex,
  toHex,
  type Address,
  type ContractFunctionArgs,
  type Hex,
} from "viem";
import { getExecutorClients } from "./flareClients";
import { resolveContractAddress } from "./flareContracts";

const FDC_PROTOCOL_ID = 200n;
const XRP_CONFIRMATIONS_REQUIRED = 3;
const XRPPAYMENT_ATTESTATION_TYPE = stringToHex("XRPPayment", { size: 32 });
const TEST_XRP_SOURCE_ID = stringToHex("testXRP", { size: 32 });
const XRP_PAYMENT_DATA_PARAMETER =
  ixrpPaymentVerificationAbi[0].inputs[0].components[1];

export const DEFAULT_TESTNET_VERIFIER_URL =
  "https://fdc-verifiers-testnet.flare.network";

export type XrpPaymentProof = ContractFunctionArgs<
  typeof ixrpPaymentVerificationAbi,
  "view",
  "verifyXRPPayment"
>[0];

export interface ExpectedXrpPayment {
  transactionId: string;
  proofOwner: Address;
  sourceAddress: string;
  destinationAddress: string;
  amountDrops: bigint;
  memoData: Hex | null;
  destinationTag: bigint | null;
  minimumConfirmations?: number;
}

export interface FdcProofConfig {
  coston2RpcUrl: string;
  executorPrivateKey: Hex;
  verifierUrl: string;
  verifierApiKey: string;
  daLayerUrl: string;
  daLayerApiKey?: string;
  prepareTimeoutMs?: number;
  finalizationTimeoutMs?: number;
  proofTimeoutMs?: number;
  initialPollDelayMs?: number;
  maxPollDelayMs?: number;
}

export interface PreparedAttestation {
  abiEncodedRequest: Hex;
}

export interface SubmittedAttestation {
  transactionHash: Hex;
  votingRoundId: bigint;
}

interface DaLayerProof {
  proof: Hex[];
  responseHex: Hex;
}

export interface FdcProofDependencies {
  prepareRequest: (
    expected: ExpectedXrpPayment,
    signal: AbortSignal,
  ) => Promise<PreparedAttestation>;
  submitRequest: (request: Hex) => Promise<SubmittedAttestation>;
  isFinalized: (votingRoundId: bigint) => Promise<boolean>;
  retrieveProof: (
    request: Hex,
    votingRoundId: bigint,
    signal: AbortSignal,
  ) => Promise<DaLayerProof | null>;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
}

export interface FdcProofLifecycle {
  onPrepared?: (request: Hex) => void | Promise<void>;
  onAttestationRequested?: (
    submitted: SubmittedAttestation,
    request: Hex,
  ) => void | Promise<void>;
  onFinalized?: (votingRoundId: bigint) => void | Promise<void>;
  onProofFetched?: (proof: XrpPaymentProof) => void | Promise<void>;
}

export interface FdcProofResumeState {
  abiEncodedRequest?: Hex;
  submitted?: SubmittedAttestation;
  finalized?: boolean;
}

export type FdcProofErrorCode =
  | "INVALID_INPUT"
  | "API_ERROR"
  | "VERIFIER_REJECTED"
  | "SUBMISSION_FAILED"
  | "TIMEOUT"
  | "MALFORMED_PROOF"
  | "PAYMENT_MISMATCH";

export class FdcProofError extends Error {
  constructor(
    public readonly code: FdcProofErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FdcProofError";
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeTransactionId(value: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new FdcProofError(
      "INVALID_INPUT",
      "XRPL transaction id must be a 32-byte hexadecimal value",
    );
  }
  return normalized.toLowerCase() as Hex;
}

function standardAddressHash(address: string): Hex {
  return keccak256(toHex(address));
}

function requireValidExpectation(expected: ExpectedXrpPayment): void {
  normalizeTransactionId(expected.transactionId);
  getAddress(expected.proofOwner);
  if (expected.amountDrops <= 0n) {
    throw new FdcProofError(
      "INVALID_INPUT",
      "Expected XRP amount must be greater than zero",
    );
  }
  if (expected.memoData !== null && !isHex(expected.memoData)) {
    throw new FdcProofError("INVALID_INPUT", "Expected memo data must be hex");
  }
  if (
    expected.destinationTag !== null &&
    (expected.destinationTag < 0n || expected.destinationTag > 0xffff_ffffn)
  ) {
    throw new FdcProofError(
      "INVALID_INPUT",
      "XRPL destination tag must fit uint32",
    );
  }
  if (
    (expected.minimumConfirmations ?? XRP_CONFIRMATIONS_REQUIRED) !==
    XRP_CONFIRMATIONS_REQUIRED
  ) {
    throw new FdcProofError(
      "INVALID_INPUT",
      `XRPPayment attestations require exactly ${XRP_CONFIRMATIONS_REQUIRED} XRPL confirmations`,
    );
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new FdcProofError(
      "API_ERROR",
      `FDC API returned non-JSON data (HTTP ${response.status})`,
      error,
    );
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function parsePreparedAttestation(value: unknown): PreparedAttestation {
  const body = record(value);
  const request = body?.abiEncodedRequest;
  if (!isHex(request)) {
    const status =
      typeof body?.status === "string" ? body.status : "missing request bytes";
    throw new FdcProofError(
      "VERIFIER_REJECTED",
      `XRPPayment verifier rejected the request: ${status}`,
    );
  }
  return { abiEncodedRequest: request };
}

function parseDaLayerProof(value: unknown): DaLayerProof | null {
  const body = record(value);
  if (!body) {
    throw new FdcProofError(
      "MALFORMED_PROOF",
      "DA Layer returned an invalid response",
    );
  }
  const responseHex = body.response_hex ?? body.responseHex;
  if (responseHex === undefined || responseHex === null) return null;
  const proof = body.proof ?? body.proofs;
  if (
    !isHex(responseHex) ||
    !Array.isArray(proof) ||
    !proof.every((entry) => isHex(entry))
  ) {
    throw new FdcProofError(
      "MALFORMED_PROOF",
      "DA Layer proof response has an invalid shape",
    );
  }
  return { proof: proof as Hex[], responseHex };
}

function createAbortSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function createFdcProofDependencies(
  config: FdcProofConfig,
): FdcProofDependencies {
  const { account, publicClient, walletClient } = getExecutorClients(
    config.executorPrivateKey,
    config.coston2RpcUrl,
  );

  return {
    async prepareRequest(expected, signal) {
      const transactionId = normalizeTransactionId(expected.transactionId);
      const response = await fetch(
        `${trimTrailingSlash(config.verifierUrl)}/verifier/xrp/XRPPayment/prepareRequest`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": config.verifierApiKey,
          },
          body: JSON.stringify({
            attestationType: XRPPAYMENT_ATTESTATION_TYPE,
            sourceId: TEST_XRP_SOURCE_ID,
            requestBody: {
              transactionId: transactionId.slice(2),
              proofOwner: getAddress(expected.proofOwner),
            },
          }),
          signal,
        },
      );
      const body = await readJsonResponse(response);
      if (!response.ok) {
        throw new FdcProofError(
          "API_ERROR",
          `XRPPayment verifier failed with HTTP ${response.status}`,
          body,
        );
      }
      return parsePreparedAttestation(body);
    },

    async submitRequest(request) {
      try {
        const fdcHub = await resolveContractAddress(publicClient, "FdcHub");
        const relay = await resolveContractAddress(publicClient, "Relay");
        const feeConfiguration = await publicClient.readContract({
          address: fdcHub,
          abi: iFdcHubAbi,
          functionName: "fdcRequestFeeConfigurations",
        });
        const fee = await publicClient.readContract({
          address: feeConfiguration,
          abi: iFdcRequestFeeConfigurationsAbi,
          functionName: "getRequestFee",
          args: [request],
        });
        const { request: simulatedRequest } =
          await publicClient.simulateContract({
            account,
            address: fdcHub,
            abi: iFdcHubAbi,
            functionName: "requestAttestation",
            args: [request],
            value: fee,
          });
        const transactionHash =
          await walletClient.writeContract(simulatedRequest);
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: transactionHash,
        });
        if (receipt.status !== "success") {
          throw new Error("FdcHub transaction reverted");
        }
        const submissionBlock = await publicClient.getBlock({
          blockNumber: receipt.blockNumber,
        });
        const votingRoundId = await publicClient.readContract({
          address: relay,
          abi: iRelayAbi,
          functionName: "getVotingRoundId",
          args: [submissionBlock.timestamp],
        });
        return { transactionHash, votingRoundId };
      } catch (error) {
        throw new FdcProofError(
          "SUBMISSION_FAILED",
          "Failed to submit XRPPayment request to FdcHub",
          error,
        );
      }
    },

    async isFinalized(votingRoundId) {
      const relay = await resolveContractAddress(publicClient, "Relay");
      return publicClient.readContract({
        address: relay,
        abi: iRelayAbi,
        functionName: "isFinalized",
        args: [FDC_PROTOCOL_ID, votingRoundId],
      });
    },

    async retrieveProof(request, votingRoundId, signal) {
      if (votingRoundId > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new FdcProofError(
          "INVALID_INPUT",
          "FDC voting round exceeds the DA Layer JSON number range",
        );
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.daLayerApiKey) {
        headers["X-API-KEY"] = config.daLayerApiKey;
      }
      const response = await fetch(
        `${trimTrailingSlash(config.daLayerUrl)}/api/v1/fdc/proof-by-request-round-raw`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            votingRoundId: Number(votingRoundId),
            requestBytes: request,
          }),
          signal,
        },
      );
      const body = await readJsonResponse(response);
      if (!response.ok) {
        const apiError = record(body)?.error;
        if (
          response.status === 404 ||
          response.status === 425 ||
          (response.status === 400 &&
            typeof apiError === "string" &&
            /attestation request not found/i.test(apiError))
        ) {
          return null;
        }
        throw new FdcProofError(
          "API_ERROR",
          `DA Layer failed with HTTP ${response.status}`,
          body,
        );
      }
      return parseDaLayerProof(body);
    },

    sleep: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now: () => Date.now(),
  };
}

async function poll<T>(
  operation: (signal: AbortSignal) => Promise<T | null>,
  dependencies: Pick<FdcProofDependencies, "sleep" | "now">,
  timeoutMs: number,
  initialDelayMs: number,
  maxDelayMs: number,
  timeoutMessage: string,
): Promise<T> {
  const startedAt = dependencies.now();
  let delayMs = initialDelayMs;
  let lastError: unknown;

  while (dependencies.now() - startedAt < timeoutMs) {
    const remaining = timeoutMs - (dependencies.now() - startedAt);
    try {
      const result = await operation(createAbortSignal(Math.max(1, remaining)));
      if (result !== null) return result;
    } catch (error) {
      if (
        error instanceof FdcProofError &&
        !["VERIFIER_REJECTED"].includes(error.code)
      ) {
        throw error;
      }
      lastError = error;
    }
    await dependencies.sleep(delayMs);
    delayMs = Math.min(Math.ceil(delayMs * 1.5), maxDelayMs);
  }

  throw new FdcProofError("TIMEOUT", timeoutMessage, lastError);
}

export function decodeXrpPaymentResponse(responseHex: Hex): XrpPaymentProof["data"] {
  try {
    return decodeAbiParameters(
      [XRP_PAYMENT_DATA_PARAMETER],
      responseHex,
    )[0] as XrpPaymentProof["data"];
  } catch (error) {
    throw new FdcProofError(
      "MALFORMED_PROOF",
      "Could not decode the XRPPayment response using the official ABI",
      error,
    );
  }
}

export function validateXrpPaymentProof(
  proof: XrpPaymentProof,
  expected: ExpectedXrpPayment,
  votingRoundId: bigint,
): void {
  requireValidExpectation(expected);
  const data = proof.data;
  const response = data.responseBody;
  const expectedTransactionId = normalizeTransactionId(expected.transactionId);
  const expectedDestinationHash = standardAddressHash(
    expected.destinationAddress,
  );

  const mismatch = (message: string): never => {
    throw new FdcProofError("PAYMENT_MISMATCH", message);
  };

  if (data.attestationType.toLowerCase() !== XRPPAYMENT_ATTESTATION_TYPE) {
    mismatch("Proof is not an XRPPayment attestation");
  }
  if (data.sourceId.toLowerCase() !== TEST_XRP_SOURCE_ID) {
    mismatch("Proof is not for XRPL testnet");
  }
  if (data.votingRound !== votingRoundId) {
    mismatch("Proof voting round does not match the submitted request");
  }
  if (
    data.requestBody.transactionId.toLowerCase() !== expectedTransactionId
  ) {
    mismatch("Proof transaction id does not match the observed payment");
  }
  if (!isAddressEqual(data.requestBody.proofOwner, expected.proofOwner)) {
    mismatch("Proof owner does not match the executor");
  }
  if (response.status !== 0) {
    mismatch(`XRPL payment was not successful (status ${response.status})`);
  }
  if (response.sourceAddress !== expected.sourceAddress) {
    mismatch("XRPL payment source does not match");
  }
  if (
    response.sourceAddressHash.toLowerCase() !==
    standardAddressHash(expected.sourceAddress)
  ) {
    mismatch("XRPL source-address hash does not match");
  }
  if (
    response.receivingAddressHash.toLowerCase() !== expectedDestinationHash ||
    response.intendedReceivingAddressHash.toLowerCase() !==
      expectedDestinationHash
  ) {
    mismatch("XRPL payment destination does not match");
  }
  if (
    response.receivedAmount !== expected.amountDrops ||
    response.intendedReceivedAmount !== expected.amountDrops
  ) {
    mismatch("XRPL payment amount does not match");
  }
  if (expected.memoData === null) {
    if (response.hasMemoData) mismatch("XRPL payment has an unexpected memo");
  } else if (
    !response.hasMemoData ||
    response.firstMemoData.toLowerCase() !== expected.memoData.toLowerCase()
  ) {
    mismatch("XRPL payment memo does not match");
  }
  if (expected.destinationTag === null) {
    if (response.hasDestinationTag) {
      mismatch("XRPL payment has an unexpected destination tag");
    }
  } else if (
    !response.hasDestinationTag ||
    response.destinationTag !== expected.destinationTag
  ) {
    mismatch("XRPL payment destination tag does not match");
  }
}

export async function requestPaymentProof(
  expected: ExpectedXrpPayment,
  config: FdcProofConfig,
  dependencies: FdcProofDependencies = createFdcProofDependencies(config),
  lifecycle: FdcProofLifecycle = {},
  resume: FdcProofResumeState = {},
): Promise<XrpPaymentProof> {
  requireValidExpectation(expected);
  const prepareTimeoutMs = config.prepareTimeoutMs ?? 60_000;
  const finalizationTimeoutMs = config.finalizationTimeoutMs ?? 300_000;
  const proofTimeoutMs = config.proofTimeoutMs ?? 120_000;
  const initialDelayMs = config.initialPollDelayMs ?? 3_000;
  const maxDelayMs = config.maxPollDelayMs ?? 15_000;

  const prepared = resume.abiEncodedRequest
    ? { abiEncodedRequest: resume.abiEncodedRequest }
    : await poll(
        (signal) =>
          dependencies.prepareRequest(expected, signal).catch((error) => {
            if (
              error instanceof FdcProofError &&
              error.code === "VERIFIER_REJECTED"
            ) {
              return null;
            }
            throw error;
          }),
        dependencies,
        prepareTimeoutMs,
        initialDelayMs,
        maxDelayMs,
        "Timed out waiting for the XRPL transaction to reach 3 confirmations",
      );
  if (!resume.abiEncodedRequest) {
    await lifecycle.onPrepared?.(prepared.abiEncodedRequest);
  }

  const submitted =
    resume.submitted ??
    (await dependencies.submitRequest(prepared.abiEncodedRequest));
  if (!resume.submitted) {
    await lifecycle.onAttestationRequested?.(
      submitted,
      prepared.abiEncodedRequest,
    );
  }

  if (!resume.finalized) {
    await poll(
      async () =>
        (await dependencies.isFinalized(submitted.votingRoundId)) ? true : null,
      dependencies,
      finalizationTimeoutMs,
      initialDelayMs,
      maxDelayMs,
      `Timed out waiting for FDC voting round ${submitted.votingRoundId} to finalize`,
    );
    await lifecycle.onFinalized?.(submitted.votingRoundId);
  }

  const daProof = await poll(
    (signal) =>
      dependencies.retrieveProof(
        prepared.abiEncodedRequest,
        submitted.votingRoundId,
        signal,
      ),
    dependencies,
    proofTimeoutMs,
    initialDelayMs,
    maxDelayMs,
    "Timed out waiting for the DA Layer to generate the XRPPayment proof",
  );

  const proof = {
    merkleProof: daProof.proof,
    data: decodeXrpPaymentResponse(daProof.responseHex),
  } as XrpPaymentProof;
  validateXrpPaymentProof(proof, expected, submitted.votingRoundId);
  await lifecycle.onProofFetched?.(proof);
  return proof;
}
