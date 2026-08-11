import "server-only";

import { iAssetManagerAbi as coston2AssetManagerAbi } from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import { iAssetManagerAbi as flareAssetManagerAbi } from "@flarenetwork/flare-wagmi-periphery-package/contracts/flare";
import type { Address } from "viem";
import { getFxrpAssetManagerAddress, getFxrpTokenAddress, getPublicClient, ERC20_ABI } from "../contracts";

export type FassetsNetwork = "coston2" | "flare";

/**
 * `AgentInfo.Status`, from the FAssets contracts
 * (contracts/userInterfaces/data/AgentInfo.sol). Not re-derivable from the
 * ABI — Solidity enums are transmitted as bare `uint8` with no on-chain name,
 * so this ordering was pulled from the FAssets source itself.
 */
const AGENT_STATUS_LABELS = [
  "Normal",
  "Liquidation",
  "Full liquidation",
  "Destroying",
  "Destroyed",
] as const;

export type RiskTier = "healthy" | "at-risk" | "below-minting-threshold" | "critical";

export interface AgentRiskRow {
  agentVault: Address;
  ownerManagementAddress: Address;
  statusCode: number;
  status: string;
  feePercent: number;
  vaultCollateralRatioPercent: number;
  mintingVaultCollateralRatioPercent: number;
  poolCollateralRatioPercent: number;
  mintingPoolCollateralRatioPercent: number;
  freeCollateralLots: string;
  mintedFxrp: string;
  riskTier: RiskTier;
}

export interface AgentRiskOverview {
  network: FassetsNetwork;
  assetManager: Address;
  fxrpToken: Address;
  totalAgents: number;
  agents: AgentRiskRow[];
  checkedAt: string;
}

const BIPS_DENOMINATOR = 10_000;

// Ratio margin above the agent's own minting threshold before we stop
// calling it "at risk" — i.e. within 10% of the floor that would exclude it
// from new minting.
const AT_RISK_MARGIN_BIPS = 1_000;

function classifyRisk(statusCode: number, vaultRatioBIPS: bigint, mintingVaultRatioBIPS: bigint, poolRatioBIPS: bigint, mintingPoolRatioBIPS: bigint): RiskTier {
  if (statusCode !== 0) return "critical";
  if (vaultRatioBIPS < mintingVaultRatioBIPS || poolRatioBIPS < mintingPoolRatioBIPS) {
    return "below-minting-threshold";
  }
  const vaultMarginBIPS = vaultRatioBIPS - mintingVaultRatioBIPS;
  const poolMarginBIPS = poolRatioBIPS - mintingPoolRatioBIPS;
  const marginBIPS = vaultMarginBIPS < poolMarginBIPS ? vaultMarginBIPS : poolMarginBIPS;
  if (marginBIPS < BigInt(AT_RISK_MARGIN_BIPS)) return "at-risk";
  return "healthy";
}

function bipsToPercent(bips: bigint): number {
  return (Number(bips) / BIPS_DENOMINATOR) * 100;
}

/**
 * Pulls every available FXRP agent's collateral state and flags how close
 * each one is to its own minting-eligibility floor. Uses the typed
 * IAssetManager ABI from @flarenetwork/flare-wagmi-periphery-package rather
 * than a hand-written struct — see AgentRiskMonitor.tsx's original stub
 * comment for why that matters (a truncated tuple ABI silently decodes into
 * plausible-looking wrong numbers).
 */
export async function getAgentRiskOverview(network: FassetsNetwork, limit = 50): Promise<AgentRiskOverview> {
  const client = getPublicClient(network);
  const abi = network === "coston2" ? coston2AssetManagerAbi : flareAssetManagerAbi;
  const assetManager = await getFxrpAssetManagerAddress(network);
  const fxrpToken = await getFxrpTokenAddress(network);

  const [decimals, [availableAgents, totalAgents]] = await Promise.all([
    client.readContract({ address: fxrpToken, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({
      address: assetManager,
      abi,
      functionName: "getAvailableAgentsDetailedList",
      args: [0n, BigInt(limit)],
    }),
  ]);

  const agents = await Promise.all(
    availableAgents.map(async (summary): Promise<AgentRiskRow> => {
      const info = await client.readContract({
        address: assetManager,
        abi,
        functionName: "getAgentInfo",
        args: [summary.agentVault],
      });

      const riskTier = classifyRisk(
        info.status,
        info.vaultCollateralRatioBIPS,
        info.mintingVaultCollateralRatioBIPS,
        info.poolCollateralRatioBIPS,
        info.mintingPoolCollateralRatioBIPS,
      );

      return {
        agentVault: summary.agentVault,
        ownerManagementAddress: summary.ownerManagementAddress,
        statusCode: info.status,
        status: AGENT_STATUS_LABELS[info.status] ?? `Unknown (${info.status})`,
        feePercent: bipsToPercent(summary.feeBIPS),
        vaultCollateralRatioPercent: bipsToPercent(info.vaultCollateralRatioBIPS),
        mintingVaultCollateralRatioPercent: bipsToPercent(info.mintingVaultCollateralRatioBIPS),
        poolCollateralRatioPercent: bipsToPercent(info.poolCollateralRatioBIPS),
        mintingPoolCollateralRatioPercent: bipsToPercent(info.mintingPoolCollateralRatioBIPS),
        freeCollateralLots: summary.freeCollateralLots.toString(),
        mintedFxrp: (Number(info.mintedUBA) / 10 ** decimals).toLocaleString(undefined, { maximumFractionDigits: 2 }),
        riskTier,
      };
    }),
  );

  return {
    network,
    assetManager,
    fxrpToken,
    totalAgents: Number(totalAgents),
    agents,
    checkedAt: new Date().toISOString(),
  };
}
