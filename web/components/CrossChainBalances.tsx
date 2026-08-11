"use client";

import { useState } from "react";
import { createPublicClient, http, formatUnits } from "viem";
import { ERC20_ABI } from "@/lib/contracts";
import { FXRP_OFT_DEPLOYMENTS } from "@/lib/oftDeployments";

interface Row {
  chainName: string;
  balance: string | null;
  status: "not-configured" | "loaded" | "error";
}

/**
 * Cross-chain FXRP balance rollup — the feature that makes "Cross-Chain
 * Portfolio" (the product name) actually true, instead of a Flare-only view.
 *
 * Deliberately renders a "not configured" row for every chain until its
 * chainId + fxrpOftAddress are filled in in lib/oftDeployments.ts — see that
 * file for why those are left blank rather than guessed.
 */
export function CrossChainBalances({ address }: { address?: `0x${string}` }) {
  const [rows, setRows] = useState<Row[]>(
    FXRP_OFT_DEPLOYMENTS.map((d) => ({ chainName: d.chainName, balance: null, status: "not-configured" }))
  );
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    if (!address) return;
    setLoading(true);
    const results = await Promise.all(
      FXRP_OFT_DEPLOYMENTS.map(async (deployment): Promise<Row> => {
        if (!deployment.chainId || !deployment.fxrpOftAddress) {
          return { chainName: deployment.chainName, balance: null, status: "not-configured" };
        }
        try {
          const client = createPublicClient({
            chain: { id: deployment.chainId, name: deployment.chainName, nativeCurrency: { name: "", symbol: "", decimals: 18 }, rpcUrls: { default: { http: [] } } },
            transport: http(),
          });
          const [balance, decimals] = await Promise.all([
            client.readContract({
              address: deployment.fxrpOftAddress,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address],
            }),
            client.readContract({
              address: deployment.fxrpOftAddress,
              abi: ERC20_ABI,
              functionName: "decimals",
            }),
          ]);
          return { chainName: deployment.chainName, balance: formatUnits(balance, decimals), status: "loaded" };
        } catch {
          return { chainName: deployment.chainName, balance: null, status: "error" };
        }
      })
    );
    setRows(results);
    setLoading(false);
  }

  return (
    <section>
      <h2>Cross-Chain FXRP</h2>
      <p>FXRP balance across every chain where the LayerZero OFT is deployed.</p>
      <button onClick={loadAll} disabled={!address || loading}>
        {loading ? "Loading…" : "Refresh"}
      </button>
      <table>
        <thead>
          <tr>
            <th>Chain</th>
            <th>FXRP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.chainName}>
              <td>{row.chainName}</td>
              <td>
                {row.status === "loaded" && row.balance}
                {row.status === "not-configured" && "not configured — see lib/oftDeployments.ts"}
                {row.status === "error" && "error"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
