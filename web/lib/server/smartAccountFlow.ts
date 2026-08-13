import "server-only";

import {
  iAssetManagerAbi,
  iMasterAccountControllerAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import { formatUnits, type Address, type Hex } from "viem";
import {
  createXamanDirectMintDependencies,
  createXamanDirectMintService,
  type InstructionPaymentTemplate,
} from "flareramp-executor/xaman-direct-mint";
import {
  ERC20_ABI,
  getFxrpAssetManagerAddress,
  getFxrpTokenAddress,
  getMasterAccountControllerAddress,
  getPublicClient,
} from "../contracts";
import {
  SMART_ACCOUNT_ACTION_IDS,
  actionLabel,
  vaultTypeForAction,
  type SmartAccountActionKind,
} from "../smartAccountActions";
import {
  encodeFirelightClaimWithdraw,
  encodeFirelightRedeem,
  encodeFxrpRedeem,
  encodeUpshiftClaim,
  encodeUpshiftRequestRedeem,
} from "../smartAccountInstructions";
import { FIRELIGHT_VAULT_ABI } from "../vaultContracts";
import { getWebServerConfig } from "./config";

export type CheckStatus = "pass" | "warn" | "fail";

export interface SmartAccountReviewInput {
  sourceAddress: string;
  action: SmartAccountActionKind;
  /** FXRP amount for redeem / Firelight / Upshift withdraw-request. */
  amountFxrp?: string;
  /** Explicit lots for redeem; when set, overrides amountFxrp lot conversion. */
  lots?: string;
  /** YYYYMMDD for Upshift claim (0x23). */
  claimDate?: string;
  /** Firelight vault period for claim withdraw (0x13). */
  claimPeriod?: string;
}

export interface SmartAccountReview {
  checkedAt: string;
  action: SmartAccountActionKind;
  actionLabel: string;
  instructionId: number;
  path: "Smart Account proof-based instruction";
  transaction: {
    network: "XRPL Testnet";
    sourceAddress: string;
    destination: string;
    amountXrp: string;
    amountDrops: string;
    memoData: Hex;
    personalAccount: Address;
    noDestinationTag: true;
  };
  instruction: {
    hex: Hex;
    lots?: string;
    amountFxrpWhole?: string;
    claimDate?: string;
    claimPeriod?: string;
    vaultId?: number;
    vaultAddress?: Address;
  };
  balances: {
    personalAccountFxrp: string;
    personalAccountUBA: string;
    lotSizeUBA: string;
  };
  fees: {
    instructionFeeDrops: string;
    feeSource: "instruction" | "default";
  };
  checks: Array<{
    id: string;
    status: CheckStatus;
    message: string;
    source: string;
    timestamp: string;
  }>;
}

function isLikelyXrplAddress(value: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(value.trim());
}

function parsePositiveFxrp(amountFxrp: string): { uba: bigint; whole: bigint } {
  const match = /^([0-9]+)(?:\.([0-9]{1,6}))?$/.exec(amountFxrp.trim());
  if (!match) {
    throw new Error("Amount must be a positive FXRP value with at most 6 decimals");
  }
  const wholePart = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(6, "0");
  const uba = wholePart * 1_000_000n + BigInt(fraction || "0");
  if (uba <= 0n) throw new Error("Amount must be greater than zero");
  // CRT vault value field uses whole FXRP units (skill examples), not drops.
  const whole = uba / 1_000_000n;
  if (whole <= 0n) {
    throw new Error("Vault / redeem amount must be at least 1 whole FXRP");
  }
  if (uba % 1_000_000n !== 0n) {
    throw new Error(
      "Use a whole FXRP amount (no fractional FXRP) for Smart Account instructions",
    );
  }
  return { uba, whole };
}

function check(
  id: string,
  status: CheckStatus,
  message: string,
  source: string,
  timestamp: string,
) {
  return { id, status, message, source, timestamp };
}

async function resolveVault(
  kind: SmartAccountActionKind,
): Promise<{ vaultId: number; vaultAddress: Address } | null> {
  const vaultType = vaultTypeForAction(kind);
  if (vaultType === null) return null;
  const client = getPublicClient("coston2");
  const controller = await getMasterAccountControllerAddress("coston2");
  const [vaultIds, vaultAddresses, vaultTypes] = await client.readContract({
    address: controller,
    abi: iMasterAccountControllerAbi,
    functionName: "getVaults",
  });
  for (let i = 0; i < vaultTypes.length; i++) {
    if (Number(vaultTypes[i]) === vaultType) {
      return {
        vaultId: Number(vaultIds[i]),
        vaultAddress: vaultAddresses[i],
      };
    }
  }
  throw new Error(
    vaultType === 1
      ? "No Firelight vault is registered on MasterAccountController"
      : "No Upshift vault is registered on MasterAccountController",
  );
}

/** Scan recent completed Firelight periods for unclaimed withdrawals. */
async function findClaimableFirelightPeriods(params: {
  vault: Address;
  account: Address;
  lookback?: number;
}): Promise<Array<{ period: bigint; assetsUBA: bigint }>> {
  const client = getPublicClient("coston2");
  const currentPeriod = await client.readContract({
    address: params.vault,
    abi: FIRELIGHT_VAULT_ABI,
    functionName: "currentPeriod",
  });
  const lookback = BigInt(params.lookback ?? 32);
  const start =
    currentPeriod > lookback ? currentPeriod - lookback : 0n;
  const found: Array<{ period: bigint; assetsUBA: bigint }> = [];
  for (let period = start; period < currentPeriod; period++) {
    const [assetsUBA, claimed] = await Promise.all([
      client.readContract({
        address: params.vault,
        abi: FIRELIGHT_VAULT_ABI,
        functionName: "withdrawalsOf",
        args: [period, params.account],
      }),
      client.readContract({
        address: params.vault,
        abi: FIRELIGHT_VAULT_ABI,
        functionName: "isWithdrawClaimed",
        args: [period, params.account],
      }),
    ]);
    if (assetsUBA > 0n && !claimed) {
      found.push({ period, assetsUBA });
    }
  }
  return found;
}

export async function quoteInstructionFeeDrops(
  instructionId: number,
): Promise<{ feeDrops: bigint; feeSource: "instruction" | "default" }> {
  const client = getPublicClient("coston2");
  const controller = await getMasterAccountControllerAddress("coston2");
  const [specific, fallback] = await Promise.all([
    client.readContract({
      address: controller,
      abi: iMasterAccountControllerAbi,
      functionName: "getInstructionFee",
      args: [BigInt(instructionId)],
    }),
    client.readContract({
      address: controller,
      abi: iMasterAccountControllerAbi,
      functionName: "getDefaultInstructionFee",
    }),
  ]);
  if (specific > 0n) {
    return { feeDrops: specific, feeSource: "instruction" };
  }
  if (fallback > 0n) {
    return { feeDrops: fallback, feeSource: "default" };
  }
  throw new Error("MasterAccountController returned a zero instruction fee");
}

export async function createSmartAccountReview(
  input: SmartAccountReviewInput,
): Promise<SmartAccountReview> {
  void getWebServerConfig();
  const sourceAddress = input.sourceAddress.trim();
  if (!isLikelyXrplAddress(sourceAddress)) {
    throw new Error("Enter a valid XRPL source address (starts with r)");
  }
  const action = input.action;
  const instructionId = SMART_ACCOUNT_ACTION_IDS[action];
  if (instructionId === undefined) {
    throw new Error("Unsupported Smart Account action");
  }

  const client = getPublicClient("coston2");
  const controller = await getMasterAccountControllerAddress("coston2");
  const assetManager = await getFxrpAssetManagerAddress("coston2");
  const fxrpToken = await getFxrpTokenAddress("coston2");
  const timestamp = new Date().toISOString();

  const [personalAccount, operatorWallets, settings, feeQuote] =
    await Promise.all([
      client.readContract({
        address: controller,
        abi: iMasterAccountControllerAbi,
        functionName: "getPersonalAccount",
        args: [sourceAddress],
      }),
      client.readContract({
        address: controller,
        abi: iMasterAccountControllerAbi,
        functionName: "getXrplProviderWallets",
      }),
      client.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "getSettings",
      }),
      quoteInstructionFeeDrops(instructionId),
    ]);
  const balanceUBA = await client.readContract({
    address: fxrpToken,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [personalAccount],
  });

  const operatorAddress = operatorWallets[0]?.trim();
  if (!operatorAddress || !isLikelyXrplAddress(operatorAddress)) {
    throw new Error("No operator XRPL wallet is configured on MasterAccountController");
  }

  const lotSizeUBA = BigInt(settings.lotSizeAMG);
  const checks: SmartAccountReview["checks"] = [];
  checks.push(
    check(
      "operator_wallet",
      "pass",
      `Instruction fee payment goes to operator ${operatorAddress}`,
      controller,
      timestamp,
    ),
  );
  checks.push(
    check(
      "destination_tag",
      "pass",
      "Payment must not include a destination tag (Smart Accounts requirement)",
      "XRPL Payment",
      timestamp,
    ),
  );
  checks.push(
    check(
      "personal_account",
      "pass",
      `Personal Account ${personalAccount}`,
      controller,
      timestamp,
    ),
  );

  let memoData: Hex;
  let lots: string | undefined;
  let amountFxrpWhole: string | undefined;
  let claimDate: string | undefined;
  let claimPeriod: string | undefined;
  let vaultMeta: { vaultId: number; vaultAddress: Address } | null = null;

  if (action === "redeem") {
    let lotsValue: bigint;
    if (input.lots?.trim()) {
      lotsValue = BigInt(input.lots.trim());
    } else if (input.amountFxrp?.trim()) {
      const { uba } = parsePositiveFxrp(input.amountFxrp);
      if (lotSizeUBA <= 0n || uba % lotSizeUBA !== 0n) {
        throw new Error(
          `Redeem amount must be an exact multiple of the lot size (${formatUnits(lotSizeUBA, 6)} FXRP)`,
        );
      }
      lotsValue = uba / lotSizeUBA;
    } else {
      throw new Error("Enter FXRP amount or lots for redeem");
    }
    if (lotsValue <= 0n) throw new Error("Lots must be greater than zero");
    const requiredUBA = lotsValue * lotSizeUBA;
    lots = lotsValue.toString();
    amountFxrpWhole = formatUnits(requiredUBA, 6);
    memoData = encodeFxrpRedeem({ lots: lotsValue });
    if (balanceUBA < requiredUBA) {
      checks.push(
        check(
          "balance",
          "fail",
          `Personal Account FXRP balance (${formatUnits(balanceUBA, 6)}) is below ${amountFxrpWhole} FXRP`,
          personalAccount,
          timestamp,
        ),
      );
    } else {
      checks.push(
        check(
          "balance",
          "pass",
          `Personal Account holds enough FXRP for ${lots} lot(s)`,
          personalAccount,
          timestamp,
        ),
      );
    }
  } else if (action === "upshiftClaim") {
    const raw = (input.claimDate ?? "").trim();
    if (!/^\d{8}$/.test(raw)) {
      throw new Error("Upshift claim date must be YYYYMMDD");
    }
    claimDate = raw;
    const vault = await resolveVault(action);
    if (!vault) throw new Error("Upshift vault resolution failed");
    vaultMeta = vault;
    memoData = encodeUpshiftClaim({
      date: Number(raw),
      vaultId: vault.vaultId,
    });
    checks.push(
      check(
        "balance",
        "warn",
        "Claim does not spend liquid FXRP; ensure the Upshift withdraw lag has elapsed",
        vault.vaultAddress,
        timestamp,
      ),
    );
  } else if (action === "firelightClaim") {
    const raw = (input.claimPeriod ?? "").trim();
    if (!/^\d+$/.test(raw)) {
      throw new Error(
        "Firelight claim needs the vault period id from your withdraw request (not an FXRP amount)",
      );
    }
    const period = BigInt(raw);
    claimPeriod = period.toString();
    const vault = await resolveVault(action);
    if (!vault) throw new Error("Firelight vault resolution failed");
    vaultMeta = vault;
    memoData = encodeFirelightClaimWithdraw({
      period,
      vaultId: vault.vaultId,
    });

    let claimable: Array<{ period: bigint; assetsUBA: bigint }> = [];
    try {
      claimable = await findClaimableFirelightPeriods({
        vault: vault.vaultAddress,
        account: personalAccount,
      });
    } catch {
      checks.push(
        check(
          "claim_period_scan",
          "warn",
          "Could not scan Firelight periods; confirm the period id against your withdraw request",
          vault.vaultAddress,
          timestamp,
        ),
      );
    }

    if (claimable.length > 0) {
      const hint = claimable
        .slice(0, 5)
        .map(
          (entry) =>
            `period ${entry.period.toString()} (${formatUnits(entry.assetsUBA, 6)} FXRP)`,
        )
        .join(", ");
      checks.push(
        check(
          "claim_period_scan",
          "pass",
          `Claimable Firelight period(s): ${hint}`,
          vault.vaultAddress,
          timestamp,
        ),
      );
    } else {
      checks.push(
        check(
          "claim_period_scan",
          "warn",
          "No unclaimed Firelight withdrawals found in recent completed periods — run withdraw request (0x12) first and wait for the period to end",
          vault.vaultAddress,
          timestamp,
        ),
      );
    }

    const match = claimable.find((entry) => entry.period === period);
    if (match) {
      checks.push(
        check(
          "claim_period",
          "pass",
          `Period ${claimPeriod} has ${formatUnits(match.assetsUBA, 6)} FXRP ready to claim`,
          vault.vaultAddress,
          timestamp,
        ),
      );
    } else if (claimable.length > 0) {
      checks.push(
        check(
          "claim_period",
          "fail",
          `Period ${claimPeriod} is not claimable for this Personal Account (NoWithdrawalAmount). Pick one of the claimable periods above — value is the period id, not FXRP amount`,
          vault.vaultAddress,
          timestamp,
        ),
      );
    } else {
      checks.push(
        check(
          "claim_period",
          "warn",
          `Encoding claim for period ${claimPeriod}; confirm it matches your Firelight withdraw request period`,
          vault.vaultAddress,
          timestamp,
        ),
      );
    }
  } else {
    if (!input.amountFxrp?.trim()) {
      throw new Error("Enter an FXRP amount for this vault action");
    }
    const { whole, uba } = parsePositiveFxrp(input.amountFxrp);
    amountFxrpWhole = whole.toString();
    const vault = await resolveVault(action);
    if (!vault) throw new Error("Vault resolution failed");
    vaultMeta = vault;
    if (action === "firelightWithdraw") {
      memoData = encodeFirelightRedeem({
        amountFxrp: whole,
        vaultId: vault.vaultId,
      });
    } else {
      memoData = encodeUpshiftRequestRedeem({
        amountFxrp: whole,
        vaultId: vault.vaultId,
      });
    }
    if (balanceUBA < uba) {
      // Vault shares may be held as vault tokens; liquid FXRP check is advisory.
      checks.push(
        check(
          "balance",
          "warn",
          `Liquid Personal Account FXRP (${formatUnits(balanceUBA, 6)}) is below ${amountFxrpWhole}; vault shares may still cover this exit`,
          personalAccount,
          timestamp,
        ),
      );
    } else {
      checks.push(
        check(
          "balance",
          "pass",
          `Vault action encoded for ${amountFxrpWhole} FXRP (vault id ${vault.vaultId})`,
          vault.vaultAddress,
          timestamp,
        ),
      );
    }
  }

  checks.push(
    check(
      "instruction_fee",
      "pass",
      `Instruction fee ${feeQuote.feeDrops.toString()} drops (${feeQuote.feeSource})`,
      controller,
      timestamp,
    ),
  );

  const amountDrops = feeQuote.feeDrops.toString();
  const amountXrp = formatUnits(feeQuote.feeDrops, 6);

  return {
    checkedAt: timestamp,
    action,
    actionLabel: actionLabel(action),
    instructionId,
    path: "Smart Account proof-based instruction",
    transaction: {
      network: "XRPL Testnet",
      sourceAddress,
      destination: operatorAddress,
      amountXrp,
      amountDrops,
      memoData,
      personalAccount,
      noDestinationTag: true,
    },
    instruction: {
      hex: memoData,
      lots,
      amountFxrpWhole,
      claimDate,
      claimPeriod,
      vaultId: vaultMeta?.vaultId,
      vaultAddress: vaultMeta?.vaultAddress,
    },
    balances: {
      personalAccountFxrp: formatUnits(balanceUBA, 6),
      personalAccountUBA: balanceUBA.toString(),
      lotSizeUBA: lotSizeUBA.toString(),
    },
    fees: {
      instructionFeeDrops: amountDrops,
      feeSource: feeQuote.feeSource,
    },
    checks,
  };
}

export function assertSmartAccountSigningReady(review: SmartAccountReview): void {
  const failed = review.checks.filter((entry) => entry.status === "fail");
  if (failed.length > 0) {
    throw new Error(
      `Signing blocked: ${failed.map((entry) => entry.message).join("; ")}`,
    );
  }
}

export function instructionTemplateFromReview(
  review: SmartAccountReview,
): InstructionPaymentTemplate {
  return {
    sourceAddress: review.transaction.sourceAddress,
    destinationAddress: review.transaction.destination,
    amountDrops: review.transaction.amountDrops,
    memoData: review.transaction.memoData,
    forbidDestinationTag: true,
    customInstruction:
      `FlareRamp ${review.actionLabel}. Confirm fee ${review.transaction.amountDrops} drops to the Smart Accounts operator and the 32-byte instruction memo before signing.`,
  };
}

export function getXamanInstructionService() {
  const config = getWebServerConfig();
  return createXamanDirectMintService(
    createXamanDirectMintDependencies({
      apiKey: config.xamanApiKey,
      apiSecret: config.xamanApiSecret,
      xrplWssUrl: config.xrplWssUrl,
    }),
  );
}
