import "server-only";

import { createPublicClient, http, formatUnits, type Address, type Chain, type PublicClient } from "viem";
import { ERC20_ABI, getFxrpTokenAddress, getPublicClient } from "../contracts";
import { flareMainnet, coston2, ethereumMainnet, base, bnbSmartChain, hyperEvm, katana, hyperliquidTestnet } from "../chains";
import { FXRP_OFT_DEPLOYMENTS, FXRP_OFT_TESTNET_DEPLOYMENTS, type OftDeployment } from "../oftDeployments";
import { readStableUint256 } from "./stableRead";
import type { FassetsNetwork } from "./agentRisk";

export interface ChainBalanceRow {
  chainName: string;
  chainId: number | null;
  balance: string | null;
  status: "loaded" | "not-configured" | "error";
  /** True if repeated reads of this balance disagreed within the retry
   *  budget — the displayed figure is the last read, not a confirmed one.
   *  See stableRead.ts. */
  unstable?: boolean;
}

export interface CrossChainBalancesResult {
  network: FassetsNetwork;
  address: Address;
  rows: ChainBalanceRow[];
  totalFxrp: string;
  checkedAt: string;
}

const MAINNET_OFT_CHAINS: readonly Chain[] = [ethereumMainnet, base, bnbSmartChain, hyperEvm, katana];
const TESTNET_OFT_CHAINS: readonly Chain[] = [hyperliquidTestnet];
const CHAINS_BY_ID = new Map<number, PublicClient>();

function clientForChainId(chainId: number, candidates: readonly Chain[]): PublicClient | null {
  const cached = CHAINS_BY_ID.get(chainId);
  if (cached) return cached;
  const chain = candidates.find((c) => c.id === chainId);
  if (!chain) return null;
  const client = createPublicClient({ chain, transport: http() });
  CHAINS_BY_ID.set(chainId, client);
  return client;
}

/**
 * Reads the real FXRP ERC-20 balance on Flare/Coston2 directly (the OFT
 * Adapter on both networks only locks/unlocks — verified live, it reverts
 * on symbol()/decimals() — so it holds no user balances; see
 * oftDeployments.ts).
 */
async function loadHomeChainRow(network: FassetsNetwork, address: Address): Promise<ChainBalanceRow> {
  const chain = network === "flare" ? flareMainnet : coston2;
  try {
    const client = getPublicClient(network);
    const fxrpToken = await getFxrpTokenAddress(network);
    const [balanceRead, decimals] = await Promise.all([
      readStableUint256(() =>
        client.readContract({ address: fxrpToken, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
      ),
      client.readContract({ address: fxrpToken, abi: ERC20_ABI, functionName: "decimals" }),
    ]);
    return {
      chainName: chain.name,
      chainId: chain.id,
      balance: formatUnits(balanceRead.value, decimals),
      status: "loaded",
      unstable: !balanceRead.stable,
    };
  } catch {
    return { chainName: chain.name, chainId: chain.id, balance: null, status: "error" };
  }
}

async function loadOftRow(address: Address, deployment: OftDeployment, candidates: readonly Chain[]): Promise<ChainBalanceRow> {
  if (!deployment.chainId || !deployment.fxrpOftAddress) {
    return { chainName: deployment.chainName, chainId: deployment.chainId, balance: null, status: "not-configured" };
  }
  const client = clientForChainId(deployment.chainId, candidates);
  if (!client) {
    return { chainName: deployment.chainName, chainId: deployment.chainId, balance: null, status: "not-configured" };
  }
  // Captured into a local so the non-null narrowing above survives into the
  // closure passed to readStableUint256 — a property access on `deployment`
  // would not.
  const fxrpOftAddress = deployment.fxrpOftAddress;
  try {
    const [balanceRead, decimals] = await Promise.all([
      readStableUint256(() =>
        client.readContract({ address: fxrpOftAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
      ),
      client.readContract({ address: fxrpOftAddress, abi: ERC20_ABI, functionName: "decimals" }),
    ]);
    return {
      chainName: deployment.chainName,
      chainId: deployment.chainId,
      balance: formatUnits(balanceRead.value, decimals),
      status: "loaded",
      unstable: !balanceRead.stable,
    };
  } catch {
    return { chainName: deployment.chainName, chainId: deployment.chainId, balance: null, status: "error" };
  }
}

/**
 * Aggregates FXRP balance across every chain where the LayerZero OFT is
 * deployed for the given network, plus the native FXRP ERC-20 balance on the
 * network's own chain (Flare or Coston2). The testnet route today is
 * Coston2 <-> Hyperliquid Testnet only — see oftDeployments.ts.
 */
export async function getCrossChainFxrpBalances(network: FassetsNetwork, address: Address): Promise<CrossChainBalancesResult> {
  const deployments = network === "flare" ? FXRP_OFT_DEPLOYMENTS : FXRP_OFT_TESTNET_DEPLOYMENTS;
  const candidates = network === "flare" ? MAINNET_OFT_CHAINS : TESTNET_OFT_CHAINS;

  const rows = await Promise.all([
    loadHomeChainRow(network, address),
    ...deployments.map((deployment) => loadOftRow(address, deployment, candidates)),
  ]);

  const totalFxrp = rows
    .filter((row) => row.status === "loaded" && row.balance !== null)
    .reduce((sum, row) => sum + Number(row.balance), 0)
    .toLocaleString(undefined, { maximumFractionDigits: 6 });

  return { network, address, rows, totalFxrp, checkedAt: new Date().toISOString() };
}
