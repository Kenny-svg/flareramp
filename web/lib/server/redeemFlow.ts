import "server-only";

import {
  iAssetManagerAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import { formatUnits, getAddress, type Address } from "viem";
import {
  ERC20_ABI,
  getFxrpAssetManagerAddress,
  getFxrpTokenAddress,
  getPublicClient,
} from "../contracts";
import { getWebServerConfig } from "./config";
import { REDEEM_WRITE_ABI } from "../redeemAbi";

export { REDEEM_WRITE_ABI };

export interface RedeemQuote {
  checkedAt: string;
  assetManager: Address;
  fxrpToken: Address;
  lotSizeUBA: string;
  minimumRedeemAmountUBA: string;
  redeemWithTagSupported: boolean;
  balanceUBA: string;
  balanceFxrp: string;
  amountUBA: string;
  amountFxrp: string;
  lotsEquivalent: string;
  xrplDestination: string;
  destinationTag: string | null;
  warnings: string[];
}

export interface RedeemQuoteInput {
  walletAddress: string;
  amountFxrp: string;
  xrplDestination: string;
  destinationTag?: string;
}

function fxrpToUba(amountFxrp: string): bigint {
  const match = /^([0-9]+)(?:\.([0-9]{1,6}))?$/.exec(amountFxrp.trim());
  if (!match) {
    throw new Error("Amount must be a positive FXRP value with at most 6 decimals");
  }
  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(6, "0");
  const uba = whole * 1_000_000n + BigInt(fraction || "0");
  if (uba <= 0n) throw new Error("Amount must be greater than zero");
  return uba;
}

function isLikelyXrplAddress(value: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(value.trim());
}

export async function createRedeemQuote(
  input: RedeemQuoteInput,
): Promise<RedeemQuote> {
  if (!isLikelyXrplAddress(input.xrplDestination)) {
    throw new Error("Enter a valid XRPL destination address (starts with r)");
  }
  const wallet = getAddress(input.walletAddress);
  const amountUBA = fxrpToUba(input.amountFxrp);
  const client = getPublicClient("coston2");
  // Ensure web config is loaded (RPC may come from env).
  void getWebServerConfig();

  const assetManager = await getFxrpAssetManagerAddress("coston2");
  const fxrpToken = await getFxrpTokenAddress("coston2");
  const [
    settings,
    minimumRedeemAmountUBA,
    redeemWithTagSupported,
    balanceUBA,
  ] = await Promise.all([
    client.readContract({
      address: assetManager,
      abi: iAssetManagerAbi,
      functionName: "getSettings",
    }),
    client.readContract({
      address: assetManager,
      abi: iAssetManagerAbi,
      functionName: "minimumRedeemAmountUBA",
    }),
    client.readContract({
      address: assetManager,
      abi: iAssetManagerAbi,
      functionName: "redeemWithTagSupported",
    }),
    client.readContract({
      address: fxrpToken,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [wallet],
    }),
  ]);

  const lotSizeAMG = BigInt(settings.lotSizeAMG);
  const lotSizeUBA = lotSizeAMG;
  const warnings: string[] = [];
  if (amountUBA < minimumRedeemAmountUBA) {
    warnings.push(
      `Amount is below minimumRedeemAmountUBA (${minimumRedeemAmountUBA.toString()})`,
    );
  }
  if (amountUBA > balanceUBA) {
    warnings.push("Wallet FXRP balance is lower than the requested redeem amount");
  }
  let destinationTag: string | null = null;
  if (input.destinationTag?.trim()) {
    if (!redeemWithTagSupported) {
      throw new Error("redeemWithTag is not supported on this AssetManager");
    }
    const tag = BigInt(input.destinationTag.trim());
    if (tag < 0n || tag > 0xffffffffn) {
      throw new Error("Destination tag must fit in a uint32");
    }
    destinationTag = tag.toString();
  }

  const lotsEquivalent =
    lotSizeUBA > 0n ? (amountUBA / lotSizeUBA).toString() : "0";

  return {
    checkedAt: new Date().toISOString(),
    assetManager,
    fxrpToken,
    lotSizeUBA: lotSizeUBA.toString(),
    minimumRedeemAmountUBA: minimumRedeemAmountUBA.toString(),
    redeemWithTagSupported,
    balanceUBA: balanceUBA.toString(),
    balanceFxrp: formatUnits(balanceUBA, 6),
    amountUBA: amountUBA.toString(),
    amountFxrp: formatUnits(amountUBA, 6),
    lotsEquivalent,
    xrplDestination: input.xrplDestination.trim(),
    destinationTag,
    warnings,
  };
}
