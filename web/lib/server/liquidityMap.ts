import "server-only";

import { formatUnits } from "viem";
import { ERC20_ABI, getPublicClient } from "../contracts";
import { FIRELIGHT_VAULT_ABI, UPSHIFT_VAULT_ABI } from "../vaultContracts";
import { COSTON2_VAULT_DEPLOYMENTS } from "../vaultDeployments";

export interface LiquidityNode {
  protocol: "Firelight" | "Upshift";
  vaultAddress: string;
  assetSymbol: string;
  /** Formatted TVL in the underlying asset (FXRP on Coston2). */
  tvl: string;
  tvlNumber: number;
  /**
   * "exact" = read from a dedicated totalAssets()-style call (Firelight).
   * "proxy" = the vault's own balance of its reference asset, used because
   * no totalAssets()-equivalent exists on Upshift's ITokenizedVault — see
   * lib/vaultContracts.ts. Could understate TVL if the vault deploys
   * capital elsewhere instead of holding it directly.
   */
  tvlSource: "exact" | "proxy";
  status: "active" | "paused";
  /** Share price proxy: assets per share, where shares data is available. */
  assetsPerShare: number | null;
  details: Record<string, string>;
}

export interface LiquidityOverview {
  network: "coston2";
  nodes: LiquidityNode[];
  checkedAt: string;
}

async function loadFirelight(vaultAddress: `0x${string}`): Promise<LiquidityNode> {
  const client = getPublicClient("coston2");
  const assetAddress = await client.readContract({ address: vaultAddress, abi: FIRELIGHT_VAULT_ABI, functionName: "asset" });
  const [totalAssets, assetSymbol, assetDecimals, shareDecimals, shareSymbol, totalSupply] = await Promise.all([
    client.readContract({ address: vaultAddress, abi: FIRELIGHT_VAULT_ABI, functionName: "totalAssets" }),
    client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: vaultAddress, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: vaultAddress, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address: vaultAddress, abi: ERC20_ABI, functionName: "totalSupply" }),
  ]);

  const tvlNumber = Number(formatUnits(totalAssets, assetDecimals));
  const supplyNumber = Number(formatUnits(totalSupply, shareDecimals));

  return {
    protocol: "Firelight",
    vaultAddress,
    assetSymbol,
    tvl: tvlNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    tvlNumber,
    tvlSource: "exact",
    status: "active",
    assetsPerShare: supplyNumber > 0 ? tvlNumber / supplyNumber : null,
    details: {
      "Share token": shareSymbol,
      "Shares outstanding": supplyNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    },
  };
}

async function loadUpshift(vaultAddress: `0x${string}`): Promise<LiquidityNode> {
  const client = getPublicClient("coston2");
  const [assetAddress, lpTokenAddress, withdrawalsPaused, lagDuration, withdrawalFee, instantRedemptionFee, maxWithdrawalAmount, epoch] =
    await Promise.all([
      client.readContract({ address: vaultAddress, abi: UPSHIFT_VAULT_ABI, functionName: "asset" }),
      client.readContract({ address: vaultAddress, abi: UPSHIFT_VAULT_ABI, functionName: "lpTokenAddress" }),
      client.readContract({ address: vaultAddress, abi: UPSHIFT_VAULT_ABI, functionName: "withdrawalsPaused" }),
      client.readContract({ address: vaultAddress, abi: UPSHIFT_VAULT_ABI, functionName: "lagDuration" }),
      client.readContract({ address: vaultAddress, abi: UPSHIFT_VAULT_ABI, functionName: "withdrawalFee" }),
      client.readContract({ address: vaultAddress, abi: UPSHIFT_VAULT_ABI, functionName: "instantRedemptionFee" }),
      client.readContract({ address: vaultAddress, abi: UPSHIFT_VAULT_ABI, functionName: "maxWithdrawalAmount" }),
      client.readContract({ address: vaultAddress, abi: UPSHIFT_VAULT_ABI, functionName: "getWithdrawalEpoch" }),
    ]);

  const [assetSymbol, assetDecimals, vaultAssetBalance] = await Promise.all([
    client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [vaultAddress] }),
  ]);
  const [lpSymbol, lpDecimals, lpTotalSupply] = await Promise.all([
    client.readContract({ address: lpTokenAddress, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address: lpTokenAddress, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: lpTokenAddress, abi: ERC20_ABI, functionName: "totalSupply" }),
  ]);

  const tvlNumber = Number(formatUnits(vaultAssetBalance, assetDecimals));
  const lpSupplyNumber = Number(formatUnits(lpTotalSupply, lpDecimals));
  const [year, month, day, claimableEpoch] = epoch;

  return {
    protocol: "Upshift",
    vaultAddress,
    assetSymbol,
    tvl: tvlNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    tvlNumber,
    tvlSource: "proxy",
    status: withdrawalsPaused ? "paused" : "active",
    assetsPerShare: lpSupplyNumber > 0 ? tvlNumber / lpSupplyNumber : null,
    details: {
      "Share token": lpSymbol,
      "Shares outstanding": lpSupplyNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      "Withdrawal fee": `${Number(formatUnits(withdrawalFee, 16)).toFixed(4)}%`,
      "Instant redemption fee": `${Number(formatUnits(instantRedemptionFee, 16)).toFixed(4)}%`,
      "Withdrawal lag": `${(Number(lagDuration) / 3600).toFixed(1)}h`,
      "Max withdrawal": `${formatUnits(maxWithdrawalAmount, assetDecimals)} ${assetSymbol}`,
      "Current epoch": `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      "Claimable at": new Date(Number(claimableEpoch) * 1000).toLocaleString(),
    },
  };
}

/**
 * Reads live TVL and configuration for the Firelight and Upshift vaults on
 * Coston2 (lib/vaultDeployments.ts). Coston2-only — this app is
 * testnet-first and no mainnet vault addresses have been verified.
 */
export async function getLiquidityOverview(): Promise<LiquidityOverview> {
  const nodes = await Promise.all(
    COSTON2_VAULT_DEPLOYMENTS.map((deployment) =>
      deployment.protocol === "Firelight" ? loadFirelight(deployment.vaultAddress) : loadUpshift(deployment.vaultAddress),
    ),
  );

  return { network: "coston2", nodes, checkedAt: new Date().toISOString() };
}
