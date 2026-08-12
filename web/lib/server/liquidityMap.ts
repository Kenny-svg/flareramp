import "server-only";

import { formatUnits } from "viem";
import { ERC20_ABI, getPublicClient } from "../contracts";
import {
  type LiquidityNode,
  type LiquidityOverview,
} from "../liquidityTypes";
import { FIRELIGHT_VAULT_ABI, UPSHIFT_VAULT_ABI } from "../vaultContracts";
import { COSTON2_VAULT_DEPLOYMENTS } from "../vaultDeployments";

export type { LiquidityNode, LiquidityOverview } from "../liquidityTypes";

async function loadErc4626Vault(
  protocol: "Firelight" | "Upshift",
  vaultAddress: `0x${string}`,
): Promise<LiquidityNode> {
  const client = getPublicClient("coston2");
  const abi = protocol === "Firelight" ? FIRELIGHT_VAULT_ABI : UPSHIFT_VAULT_ABI;
  const assetAddress = await client.readContract({
    address: vaultAddress,
    abi,
    functionName: "asset",
  });
  const [totalAssets, assetSymbol, assetDecimals, shareDecimals, shareSymbol, totalSupply] =
    await Promise.all([
      client.readContract({ address: vaultAddress, abi, functionName: "totalAssets" }),
      client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: "symbol" }),
      client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: "decimals" }),
      client.readContract({ address: vaultAddress, abi: ERC20_ABI, functionName: "decimals" }),
      client.readContract({ address: vaultAddress, abi: ERC20_ABI, functionName: "symbol" }),
      client.readContract({ address: vaultAddress, abi: ERC20_ABI, functionName: "totalSupply" }),
    ]);

  const tvlNumber = Number(formatUnits(totalAssets, assetDecimals));
  const supplyNumber = Number(formatUnits(totalSupply, shareDecimals));

  return {
    protocol,
    vaultAddress,
    assetSymbol,
    tvl: tvlNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    tvlNumber,
    tvlSource: "exact",
    status: "active",
    assetsPerShare: supplyNumber > 0 ? tvlNumber / supplyNumber : null,
    details: {
      "Share token": shareSymbol,
      "Shares outstanding": supplyNumber.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      }),
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
      loadErc4626Vault(deployment.protocol, deployment.vaultAddress),
    ),
  );

  return { network: "coston2", nodes, checkedAt: new Date().toISOString() };
}
