import "server-only";

import { createPublicClient, http, formatUnits, type Address, type Chain, type PublicClient } from "viem";
import { ERC20_ABI, getFxrpTokenAddress, getPublicClient } from "../contracts";
import { flareMainnet, ethereumMainnet, base, bnbSmartChain, hyperEvm, katana } from "../chains";
import { FXRP_OFT_DEPLOYMENTS } from "../oftDeployments";

export interface ChainBalanceRow {
  chainName: string;
  chainId: number | null;
  balance: string | null;
  status: "loaded" | "not-configured" | "error";
}

export interface CrossChainBalancesResult {
  address: Address;
  rows: ChainBalanceRow[];
  totalFxrp: string;
  checkedAt: string;
}

const OFT_CHAINS: readonly Chain[] = [ethereumMainnet, base, bnbSmartChain, hyperEvm, katana];
const CHAINS_BY_ID = new Map<number, PublicClient>();

function clientForChainId(chainId: number): PublicClient | null {
  const cached = CHAINS_BY_ID.get(chainId);
  if (cached) return cached;
  const chain = OFT_CHAINS.find((c) => c.id === chainId);
  if (!chain) return null;
  const client = createPublicClient({ chain, transport: http() });
  CHAINS_BY_ID.set(chainId, client);
  return client;
}

async function loadFlareRow(address: Address): Promise<ChainBalanceRow> {
  try {
    const client = getPublicClient("flare");
    const fxrpToken = await getFxrpTokenAddress("flare");
    const [balance, decimals] = await Promise.all([
      client.readContract({ address: fxrpToken, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
      client.readContract({ address: fxrpToken, abi: ERC20_ABI, functionName: "decimals" }),
    ]);
    return { chainName: flareMainnet.name, chainId: flareMainnet.id, balance: formatUnits(balance, decimals), status: "loaded" };
  } catch {
    return { chainName: flareMainnet.name, chainId: flareMainnet.id, balance: null, status: "error" };
  }
}

async function loadOftRow(address: Address, deployment: (typeof FXRP_OFT_DEPLOYMENTS)[number]): Promise<ChainBalanceRow> {
  if (!deployment.chainId || !deployment.fxrpOftAddress) {
    return { chainName: deployment.chainName, chainId: deployment.chainId, balance: null, status: "not-configured" };
  }
  const client = clientForChainId(deployment.chainId);
  if (!client) {
    return { chainName: deployment.chainName, chainId: deployment.chainId, balance: null, status: "not-configured" };
  }
  try {
    const [balance, decimals] = await Promise.all([
      client.readContract({ address: deployment.fxrpOftAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
      client.readContract({ address: deployment.fxrpOftAddress, abi: ERC20_ABI, functionName: "decimals" }),
    ]);
    return { chainName: deployment.chainName, chainId: deployment.chainId, balance: formatUnits(balance, decimals), status: "loaded" };
  } catch {
    return { chainName: deployment.chainName, chainId: deployment.chainId, balance: null, status: "error" };
  }
}

/**
 * Aggregates FXRP balance across every chain where the LayerZero OFT is
 * deployed, plus the native FXRP ERC-20 balance on Flare itself (the OFT
 * Adapter there is lock/unlock-only and holds no user balances — see
 * oftDeployments.ts).
 */
export async function getCrossChainFxrpBalances(address: Address): Promise<CrossChainBalancesResult> {
  const rows = await Promise.all([
    loadFlareRow(address),
    ...FXRP_OFT_DEPLOYMENTS.map((deployment) => loadOftRow(address, deployment)),
  ]);

  const totalFxrp = rows
    .filter((row) => row.status === "loaded" && row.balance !== null)
    .reduce((sum, row) => sum + Number(row.balance), 0)
    .toLocaleString(undefined, { maximumFractionDigits: 6 });

  return { address, rows, totalFxrp, checkedAt: new Date().toISOString() };
}
