import {
  iAssetManagerAbi,
  iMintingTagManagerAbi,
  testFtsoV2InterfaceAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import {
  getAddress,
  isAddress,
  isAddressEqual,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  createCoston2PublicClient,
  resolveContractAddress,
} from "./flareContracts";

export const XRP_USD_FEED_ID =
  "0x015852502f55534400000000000000000000000000" as Hex;
const DIRECT_MINTING_PREFIX = "4642505266410018";
const DIRECT_MINTING_EX_PREFIX = "4642505266410021";

export type CheckStatus = "pass" | "warn" | "fail";

export interface ReadinessCheck {
  id: string;
  status: CheckStatus;
  message: string;
  source: string;
  timestamp: string;
}

export interface MintReadinessRequest {
  sourceXrplAddress: string;
  destinationXrplAddress: string;
  amountDrops: bigint;
  recipient: Address;
  executorAddress?: Address;
  memoData?: Hex;
  destinationTag?: bigint;
}

export interface FtsoFeedSnapshot {
  value: bigint;
  decimals: number;
  timestamp: bigint;
  contractAddress: Address;
}

export interface DirectMintParameters {
  assetManager: Address;
  coreVaultAddress: string;
  minimumMintingFeeUBA: bigint;
  mintingFeeBIPS: bigint;
  executorFeeUBA: bigint;
  othersCanExecuteAfterSeconds: bigint;
}

export interface MintingTagSnapshot {
  recipient: Address;
  allowedExecutor: Address;
  contractAddress: Address;
}

export interface MintReadinessDependencies {
  readFtsoFeed(): Promise<FtsoFeedSnapshot>;
  readDirectMintParameters(): Promise<DirectMintParameters>;
  readMintingTag(tag: bigint): Promise<MintingTagSnapshot>;
  readExecutorBalance(address: Address): Promise<bigint>;
  validateXrplAddress(address: string): Promise<boolean>;
  checkFdcVerifier(): Promise<{
    available: boolean;
    source: string;
  }>;
  now(): number;
}

export interface MintFeeQuote {
  paymentAmountUBA: bigint;
  percentageMintingFeeUBA: bigint;
  mintingFeeUBA: bigint;
  executorFeeUBA: bigint;
  expectedFXRPUBA: bigint;
  paymentUsd: string | null;
}

export interface MintReadinessResult {
  checkedAt: string;
  request: MintReadinessRequest;
  checks: ReadinessCheck[];
  ftso: FtsoFeedSnapshot | null;
  parameters: DirectMintParameters | null;
  quote: MintFeeQuote | null;
}

export interface MintReadinessNetworkConfig {
  rpcUrl?: string;
  verifierUrl: string;
  verifierApiKey: string;
}

function decimalString(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = absolute.toString().padStart(decimals + 1, "0");
  const integer = digits.slice(0, -decimals) || "0";
  const fraction = decimals === 0
    ? ""
    : digits.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function calculateDirectMintQuote(
  amountUBA: bigint,
  parameters: Pick<
    DirectMintParameters,
    "minimumMintingFeeUBA" | "mintingFeeBIPS" | "executorFeeUBA"
  >,
  ftso?: Pick<FtsoFeedSnapshot, "value" | "decimals">,
): MintFeeQuote {
  const percentageMintingFeeUBA =
    (amountUBA * parameters.mintingFeeBIPS) / 10_000n;
  const uncappedMintingFee =
    percentageMintingFeeUBA > parameters.minimumMintingFeeUBA
      ? percentageMintingFeeUBA
      : parameters.minimumMintingFeeUBA;
  const mintingFeeUBA =
    uncappedMintingFee > amountUBA ? amountUBA : uncappedMintingFee;
  const afterMintingFee = amountUBA - mintingFeeUBA;
  const executorFeeUBA =
    parameters.executorFeeUBA > afterMintingFee
      ? afterMintingFee
      : parameters.executorFeeUBA;
  const expectedFXRPUBA = afterMintingFee - executorFeeUBA;
  return {
    paymentAmountUBA: amountUBA,
    percentageMintingFeeUBA,
    mintingFeeUBA,
    executorFeeUBA,
    expectedFXRPUBA,
    paymentUsd: ftso
      ? decimalString(amountUBA * ftso.value, ftso.decimals + 6)
      : null,
  };
}

function decodeMemo(memo: Hex): {
  valid: boolean;
  recipient?: Address;
  executor?: Address;
  smartAccountCustomInstruction?: boolean;
  reason?: string;
} {
  const body = memo.slice(2).toLowerCase();
  try {
    if (body.length === 64 && body.startsWith(DIRECT_MINTING_PREFIX)) {
      if (body.slice(16, 24) !== "00000000") {
        return { valid: false, reason: "32-byte memo padding is invalid" };
      }
      return {
        valid: true,
        recipient: getAddress(`0x${body.slice(24)}`),
      };
    }
    if (body.length === 96 && body.startsWith(DIRECT_MINTING_EX_PREFIX)) {
      return {
        valid: true,
        recipient: getAddress(`0x${body.slice(16, 56)}`),
        executor: getAddress(`0x${body.slice(56)}`),
      };
    }
    // Smart Accounts 0xFE custom instruction: 42 bytes.
    if (body.length === 84 && body.startsWith("fe")) {
      return {
        valid: true,
        smartAccountCustomInstruction: true,
      };
    }
  } catch {
    return { valid: false, reason: "Memo contains an invalid EVM address" };
  }
  return {
    valid: false,
    reason:
      "Memo is not a supported direct-mint or Smart Accounts 0xFE custom-instruction format",
  };
}

function check(
  id: string,
  status: CheckStatus,
  message: string,
  source: string,
  timestamp: string,
): ReadinessCheck {
  return { id, status, message, source, timestamp };
}

export function createMintReadinessDependencies(
  config: MintReadinessNetworkConfig,
): MintReadinessDependencies {
  const client = createCoston2PublicClient(config.rpcUrl);
  let directParameters: DirectMintParameters | undefined;

  async function parameters(): Promise<DirectMintParameters> {
    if (directParameters) return directParameters;
    const assetManager = await resolveContractAddress(
      client,
      "AssetManagerFXRP",
    );
    const [
      coreVaultAddress,
      minimumMintingFeeUBA,
      mintingFeeBIPS,
      executorFeeUBA,
      othersCanExecuteAfterSeconds,
    ] = await Promise.all([
      client.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "directMintingPaymentAddress",
      }),
      client.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "getDirectMintingMinimumFeeUBA",
      }),
      client.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "getDirectMintingFeeBIPS",
      }),
      client.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "getDirectMintingExecutorFeeUBA",
      }),
      client.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "getDirectMintingOthersCanExecuteAfterSeconds",
      }),
    ]);
    directParameters = {
      assetManager,
      coreVaultAddress,
      minimumMintingFeeUBA,
      mintingFeeBIPS,
      executorFeeUBA,
      othersCanExecuteAfterSeconds,
    };
    return directParameters;
  }

  return {
    async readFtsoFeed() {
      const contractAddress = await resolveContractAddress(client, "FtsoV2");
      const [value, decimals, timestamp] = await client.readContract({
        address: contractAddress,
        abi: testFtsoV2InterfaceAbi,
        functionName: "getFeedById",
        args: [XRP_USD_FEED_ID],
      });
      return {
        value,
        decimals,
        timestamp,
        contractAddress,
      };
    },

    readDirectMintParameters: parameters,

    async readMintingTag(tag) {
      const { assetManager } = await parameters();
      const contractAddress = await client.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "getMintingTagManager",
      });
      const [recipient, allowedExecutor] = await Promise.all([
        client.readContract({
          address: contractAddress,
          abi: iMintingTagManagerAbi,
          functionName: "mintingRecipient",
          args: [tag],
        }),
        client.readContract({
          address: contractAddress,
          abi: iMintingTagManagerAbi,
          functionName: "allowedExecutor",
          args: [tag],
        }),
      ]);
      return { recipient, allowedExecutor, contractAddress };
    },

    readExecutorBalance: (address) => client.getBalance({ address }),

    async validateXrplAddress(address) {
      const { isValidClassicAddress } = await import("xrpl");
      return isValidClassicAddress(address);
    },

    async checkFdcVerifier() {
      const source = `${config.verifierUrl.replace(/\/+$/, "")}/verifier/xrp/XRPPayment/prepareRequest`;
      try {
        const response = await fetch(source, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": config.verifierApiKey,
          },
          body: JSON.stringify({
            attestationType: stringToHex("XRPPayment", { size: 32 }),
            sourceId: stringToHex("testXRP", { size: 32 }),
            requestBody: {
              transactionId: "0".repeat(64),
              proofOwner: zeroAddress,
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        return {
          available:
            response.status !== 401 &&
            response.status !== 403 &&
            response.status < 500,
          source,
        };
      } catch {
        return { available: false, source };
      }
    },

    now: () => Date.now(),
  };
}

export async function checkMintReadiness(
  request: MintReadinessRequest,
  dependencies: MintReadinessDependencies,
): Promise<MintReadinessResult> {
  const now = dependencies.now();
  const checkedAt = new Date(now).toISOString();
  const checks: ReadinessCheck[] = [];
  const [ftsoResult, parametersResult, addressResult, verifierResult] =
    await Promise.allSettled([
      dependencies.readFtsoFeed(),
      dependencies.readDirectMintParameters(),
      dependencies.validateXrplAddress(request.sourceXrplAddress),
      dependencies.checkFdcVerifier(),
    ]);

  const ftso =
    ftsoResult.status === "fulfilled" ? ftsoResult.value : null;
  const parameters =
    parametersResult.status === "fulfilled"
      ? parametersResult.value
      : null;

  if (ftso) {
    const ageSeconds = Math.floor(now / 1_000) - Number(ftso.timestamp);
    checks.push(
      check(
        "ftso_xrp_usd",
        ageSeconds < -5 || ageSeconds > 60
          ? "fail"
          : ageSeconds > 15
            ? "warn"
            : "pass",
        ageSeconds < -5
          ? "XRP/USD timestamp is unexpectedly in the future"
          : `XRP/USD feed age is ${ageSeconds} seconds`,
        `${ftso.contractAddress} getFeedById(${XRP_USD_FEED_ID})`,
        new Date(Number(ftso.timestamp) * 1_000).toISOString(),
      ),
    );
  } else {
    checks.push(
      check(
        "ftso_xrp_usd",
        "fail",
        "Could not read the XRP/USD feed",
        "Coston2 FlareContractsRegistry → FtsoV2",
        checkedAt,
      ),
    );
  }

  checks.push(
    check(
      "xrpl_source_address",
      addressResult.status === "fulfilled" && addressResult.value
        ? "pass"
        : "fail",
      addressResult.status === "fulfilled" && addressResult.value
        ? "XRPL source address has a valid classic-address checksum"
        : "XRPL source address is invalid",
      "xrpl.isValidClassicAddress",
      checkedAt,
    ),
  );

  if (parameters) {
    checks.push(
      check(
        "core_vault_destination",
        request.destinationXrplAddress === parameters.coreVaultAddress
          ? "pass"
          : "fail",
        request.destinationXrplAddress === parameters.coreVaultAddress
          ? "Destination matches the current FXRP Core Vault"
          : "Destination does not match the current FXRP Core Vault",
        `${parameters.assetManager} directMintingPaymentAddress()`,
        checkedAt,
      ),
    );
    const quote = calculateDirectMintQuote(
      request.amountDrops,
      parameters,
      ftso ?? undefined,
    );
    checks.push(
      check(
        "payment_amount",
        request.amountDrops < parameters.minimumMintingFeeUBA
          ? "fail"
          : quote.expectedFXRPUBA === 0n
            ? "warn"
            : "pass",
        request.amountDrops < parameters.minimumMintingFeeUBA
          ? "Payment is below the protocol minimum minting fee"
          : `Expected mint is ${quote.expectedFXRPUBA} UBA after ${quote.mintingFeeUBA} UBA minting fee and ${quote.executorFeeUBA} UBA executor fee`,
        `${parameters.assetManager} direct-mint fee getters`,
        checkedAt,
      ),
    );
  } else {
    checks.push(
      check(
        "core_vault_destination",
        "fail",
        "Could not read current direct-mint parameters",
        "Coston2 FlareContractsRegistry → AssetManagerFXRP",
        checkedAt,
      ),
    );
  }

  let routingStatus: CheckStatus = "fail";
  let routingMessage =
    "Provide exactly one routing method: destination tag or direct-mint memo";
  let tagSnapshot: MintingTagSnapshot | null = null;
  if (request.memoData !== undefined && request.destinationTag === undefined) {
    const decoded = decodeMemo(request.memoData);
    if (decoded.valid && decoded.smartAccountCustomInstruction) {
      routingStatus = "pass";
      routingMessage =
        "42-byte 0xFE memo commits a Smart Accounts custom instruction (mint + vault deposit)";
    } else if (
      decoded.valid &&
      decoded.recipient &&
      isAddressEqual(decoded.recipient, request.recipient)
    ) {
      if (
        decoded.executor &&
        request.executorAddress &&
        !isAddressEqual(decoded.executor, request.executorAddress)
      ) {
        routingMessage = "Memo executor does not match the configured operator";
      } else {
        routingStatus = "pass";
        routingMessage = decoded.executor
          ? "48-byte memo encodes the intended recipient and executor"
          : "32-byte memo encodes the intended recipient";
      }
    } else {
      routingMessage =
        decoded.reason ?? "Memo recipient does not match the intended recipient";
    }
  } else if (
    request.destinationTag !== undefined &&
    request.memoData === undefined &&
    request.destinationTag >= 0n &&
    request.destinationTag <= 0xffff_ffffn
  ) {
    try {
      tagSnapshot = await dependencies.readMintingTag(
        request.destinationTag,
      );
      if (isAddressEqual(tagSnapshot.recipient, request.recipient)) {
        routingStatus = "pass";
        routingMessage = "Destination tag resolves to the intended recipient";
      } else {
        routingMessage =
          "Destination tag recipient does not match the intended recipient";
      }
    } catch {
      routingMessage = "Destination tag is not registered or cannot be read";
    }
  }
  checks.push(
    check(
      "routing_encoding",
      routingStatus,
      routingMessage,
      tagSnapshot
        ? `${tagSnapshot.contractAddress} MintingTagManager`
        : "Flare direct-mint memo specification",
      checkedAt,
    ),
  );

  if (!request.executorAddress || !isAddress(request.executorAddress)) {
    checks.push(
      check(
        "executor_availability",
        "warn",
        "No executor address was supplied; execution availability is unverified",
        "Coston2 executor configuration",
        checkedAt,
      ),
    );
  } else {
    let allowed = true;
    if (
      tagSnapshot &&
      !isAddressEqual(tagSnapshot.allowedExecutor, zeroAddress) &&
      !isAddressEqual(
        tagSnapshot.allowedExecutor,
        request.executorAddress,
      )
    ) {
      allowed = false;
    }
    try {
      const balance = await dependencies.readExecutorBalance(
        request.executorAddress,
      );
      checks.push(
        check(
          "executor_availability",
          !allowed ? "fail" : balance === 0n ? "warn" : "pass",
          !allowed
            ? "Configured operator is not allowed for this minting tag"
            : balance === 0n
              ? "Executor is allowed but has no C2FLR for gas"
              : `Executor is allowed and has ${balance} wei of C2FLR`,
          "Coston2 account balance and direct-mint routing",
          checkedAt,
        ),
      );
    } catch {
      checks.push(
        check(
          "executor_availability",
          "fail",
          "Could not read executor availability",
          "Coston2 account balance",
          checkedAt,
        ),
      );
    }
  }

  checks.push(
    check(
      "fdc_verifier",
      verifierResult.status === "fulfilled" &&
        verifierResult.value.available
        ? "pass"
        : "fail",
      verifierResult.status === "fulfilled" &&
        verifierResult.value.available
        ? "FDC XRPPayment verifier is reachable and authenticated"
        : "FDC XRPPayment verifier is unavailable or unauthorized",
      verifierResult.status === "fulfilled"
        ? verifierResult.value.source
        : "Coston2 FDC verifier",
      checkedAt,
    ),
  );

  return {
    checkedAt,
    request,
    checks,
    ftso,
    parameters,
    quote: parameters
      ? calculateDirectMintQuote(
          request.amountDrops,
          parameters,
          ftso ?? undefined,
        )
      : null,
  };
}
