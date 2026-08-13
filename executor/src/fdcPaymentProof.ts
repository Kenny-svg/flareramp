import {
  iFdcHubAbi,
  iFdcRequestFeeConfigurationsAbi,
  iPaymentVerificationAbi,
  iRelayAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import {
  decodeAbiParameters,
  getAddress,
  isHex,
  keccak256,
  stringToHex,
  toHex,
  type Address,
  type ContractFunctionArgs,
  type Hex,
} from "viem";
import {
  FdcProofError,
  type FdcProofConfig,
  type FdcProofResumeState,
  type PreparedAttestation,
  type SubmittedAttestation,
} from "./fdcProof";
import { getExecutorClients } from "./flareClients";
import { resolveContractAddress } from "./flareContracts";

const FDC_PROTOCOL_ID = 200n;
const PAYMENT_ATTESTATION_TYPE = stringToHex("Payment", { size: 32 });
const TEST_XRP_SOURCE_ID = stringToHex("testXRP", { size: 32 });
const PAYMENT_DATA_PARAMETER =
  iPaymentVerificationAbi[0].inputs[0].components[1];

export type PaymentProof = ContractFunctionArgs<
  typeof iPaymentVerificationAbi,
  "view",
  "verifyPayment"
>[0];

export interface ExpectedInstructionPayment {
  transactionId: string;
  sourceAddress: string;
  destinationAddress: string;
  amountDrops: bigint;
  /** 32-byte Smart Account instruction memo (also the Payment standardPaymentReference). */
  memoData: Hex;
}

export interface FdcPaymentProofLifecycle {
  onPrepared?: (request: Hex) => void | Promise<void>;
  onAttestationRequested?: (
    submitted: SubmittedAttestation,
    request: Hex,
  ) => void | Promise<void>;
  onFinalized?: (votingRoundId: bigint) => void | Promise<void>;
  onProofFetched?: (proof: PaymentProof) => void | Promise<void>;
}

export interface FdcPaymentProofDependencies {
  prepareRequest: (
    expected: ExpectedInstructionPayment,
    signal: AbortSignal,
  ) => Promise<PreparedAttestation>;
  submitRequest: (request: Hex) => Promise<SubmittedAttestation>;
  isFinalized: (votingRoundId: bigint) => Promise<boolean>;
  retrieveProof: (
    request: Hex,
    votingRoundId: bigint,
    signal: AbortSignal,
  ) => Promise<{ proof: Hex[]; responseHex: Hex } | null>;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
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

function addressHash(address: string): Hex {
  return keccak256(toHex(address));
}

function memoAsBytes32(memoData: Hex): Hex {
  const body = memoData.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(body)) {
    throw new FdcProofError(
      "INVALID_INPUT",
      "Instruction memo must be exactly 32 bytes",
    );
  }
  return `0x${body}` as Hex;
}

function requireValidExpectation(expected: ExpectedInstructionPayment): void {
  normalizeTransactionId(expected.transactionId);
  memoAsBytes32(expected.memoData);
  if (expected.amountDrops <= 0n) {
    throw new FdcProofError(
      "INVALID_INPUT",
      "Expected instruction fee must be greater than zero",
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
      `Payment verifier rejected the request: ${status}`,
    );
  }
  return { abiEncodedRequest: request };
}

export function createFdcPaymentProofDependencies(
  config: FdcProofConfig,
): FdcPaymentProofDependencies {
  const { account, publicClient, walletClient } = getExecutorClients(
    config.executorPrivateKey,
    config.coston2RpcUrl,
  );

  return {
    async prepareRequest(expected, signal) {
      const transactionId = normalizeTransactionId(expected.transactionId);
      const response = await fetch(
        `${trimTrailingSlash(config.verifierUrl)}/verifier/xrp/Payment/prepareRequest`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": config.verifierApiKey,
          },
          body: JSON.stringify({
            attestationType: PAYMENT_ATTESTATION_TYPE,
            sourceId: TEST_XRP_SOURCE_ID,
            requestBody: {
              transactionId: transactionId.slice(2),
              inUtxo: "0",
              utxo: "0",
            },
          }),
          signal,
        },
      );
      const body = await readJsonResponse(response);
      if (!response.ok) {
        throw new FdcProofError(
          "API_ERROR",
          `Payment verifier failed with HTTP ${response.status}`,
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
          "Failed to submit Payment request to FdcHub",
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
      const parsed = record(body);
      if (!parsed) return null;
      const responseHex = parsed.response_hex ?? parsed.responseHex;
      if (responseHex === undefined || responseHex === null) return null;
      const proof = parsed.proof ?? parsed.proofs;
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
    },

    sleep: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now: () => Date.now(),
  };
}

export function decodePaymentResponse(responseHex: Hex): PaymentProof["data"] {
  try {
    return decodeAbiParameters(
      [PAYMENT_DATA_PARAMETER],
      responseHex,
    )[0] as PaymentProof["data"];
  } catch (error) {
    throw new FdcProofError(
      "MALFORMED_PROOF",
      "Could not decode the Payment response using the official ABI",
      error,
    );
  }
}

export function validatePaymentProof(
  proof: PaymentProof,
  expected: ExpectedInstructionPayment,
  votingRoundId: bigint,
): void {
  requireValidExpectation(expected);
  const data = proof.data;
  const response = data.responseBody;
  const expectedTransactionId = normalizeTransactionId(expected.transactionId);
  const expectedReference = memoAsBytes32(expected.memoData);
  const expectedSourceHash = addressHash(expected.sourceAddress);
  const expectedDestinationHash = addressHash(expected.destinationAddress);

  const mismatch = (message: string): never => {
    throw new FdcProofError("PAYMENT_MISMATCH", message);
  };

  if (data.attestationType.toLowerCase() !== PAYMENT_ATTESTATION_TYPE.toLowerCase()) {
    mismatch("Proof is not a Payment attestation");
  }
  if (data.sourceId.toLowerCase() !== TEST_XRP_SOURCE_ID.toLowerCase()) {
    mismatch("Proof is not for XRPL testnet");
  }
  if (data.votingRound !== votingRoundId) {
    mismatch("Proof voting round does not match the submitted request");
  }
  if (data.requestBody.transactionId.toLowerCase() !== expectedTransactionId) {
    mismatch("Proof transaction id does not match the observed payment");
  }
  if (response.status !== 0) {
    mismatch(`XRPL payment was not successful (status ${response.status})`);
  }
  if (response.sourceAddressHash.toLowerCase() !== expectedSourceHash) {
    mismatch("XRPL payment source does not match");
  }
  if (
    response.receivingAddressHash.toLowerCase() !== expectedDestinationHash ||
    response.intendedReceivingAddressHash.toLowerCase() !==
      expectedDestinationHash
  ) {
    mismatch("XRPL payment destination does not match the operator wallet");
  }
  if (
    response.receivedAmount !== expected.amountDrops ||
    response.intendedReceivedAmount !== expected.amountDrops
  ) {
    mismatch("XRPL payment amount does not match the instruction fee");
  }
  if (
    response.standardPaymentReference.toLowerCase() !== expectedReference
  ) {
    mismatch("XRPL payment reference does not match the instruction memo");
  }
}

async function poll<T>(
  operation: (signal: AbortSignal) => Promise<T | null>,
  dependencies: Pick<FdcPaymentProofDependencies, "sleep" | "now">,
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
      const result = await operation(AbortSignal.timeout(Math.max(1, remaining)));
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

export async function requestInstructionPaymentProof(
  expected: ExpectedInstructionPayment,
  config: FdcProofConfig,
  dependencies: FdcPaymentProofDependencies = createFdcPaymentProofDependencies(
    config,
  ),
  lifecycle: FdcPaymentProofLifecycle = {},
  resume: FdcProofResumeState = {},
): Promise<PaymentProof> {
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
        "Timed out waiting for the Payment verifier to accept the request",
      );
  await lifecycle.onPrepared?.(prepared.abiEncodedRequest);

  const submitted =
    resume.submitted ??
    (await dependencies.submitRequest(prepared.abiEncodedRequest));
  await lifecycle.onAttestationRequested?.(
    submitted,
    prepared.abiEncodedRequest,
  );

  if (!resume.finalized) {
    await poll(
      async () =>
        (await dependencies.isFinalized(submitted.votingRoundId))
          ? true
          : null,
      dependencies,
      finalizationTimeoutMs,
      initialDelayMs,
      maxDelayMs,
      "Timed out waiting for FDC Payment finalization",
    );
  }
  await lifecycle.onFinalized?.(submitted.votingRoundId);

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
    "Timed out waiting for the Payment Merkle proof",
  );

  const proof: PaymentProof = {
    merkleProof: daProof.proof,
    data: decodePaymentResponse(daProof.responseHex),
  };
  validatePaymentProof(proof, expected, submitted.votingRoundId);
  await lifecycle.onProofFetched?.(proof);
  return proof;
}

/** Resolve operator XRPL wallets from MasterAccountController (for watcher config). */
export async function resolveOperatorXrplWallets(
  privateKey: Hex,
  rpcUrl: string,
): Promise<string[]> {
  const { publicClient } = getExecutorClients(privateKey, rpcUrl);
  const controller = await resolveContractAddress(
    publicClient,
    "MasterAccountController",
  );
  const { iMasterAccountControllerAbi } = await import(
    "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2"
  );
  const wallets = await publicClient.readContract({
    address: controller as Address,
    abi: iMasterAccountControllerAbi,
    functionName: "getXrplProviderWallets",
  });
  return wallets.map((wallet) => wallet.trim()).filter(Boolean);
}
