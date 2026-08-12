"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentRiskOverview, RiskTier } from "@/lib/server/agentRisk";

type FassetsNetwork = "coston2" | "flare";

const RISK_STYLES: Record<RiskTier, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  "at-risk": { label: "At risk", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  "below-minting-threshold": {
    label: "Below minting threshold",
    className: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  },
  critical: { label: "Critical", className: "bg-red-500/10 text-red-400 border-red-500/30" },
};

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Agent Collateral / Risk Monitor — reads live collateral state for every
 * FXRP agent via IAssetManager.getAvailableAgentsDetailedList +
 * getAgentInfo, and flags agents whose current collateral ratio is close to
 * or below their own minting-eligibility floor. Backed by
 * app/api/agents/risk, which uses the typed IAssetManager ABI from
 * @flarenetwork/flare-wagmi-periphery-package (see lib/server/agentRisk.ts).
 */
export function AgentRiskMonitor() {
  const [network, setNetwork] = useState<FassetsNetwork>("coston2");
  const [overview, setOverview] = useState<AgentRiskOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedNetwork: FassetsNetwork) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/risk?network=${selectedNetwork}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load agent risk overview");
      setOverview(body as AgentRiskOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load agent risk overview");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(network);
  }, [network, load]);

  return (
    <section className="bg-zinc-900/30 border border-zinc-800/80 backdrop-blur-md p-6 rounded-2xl shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-black tracking-tight text-white">Agent Collateral / Risk Monitor</h2>
          <p className="text-zinc-400 text-sm mt-1">
            Live collateral ratios for every FXRP agent vs. each agent&apos;s own minting-eligibility floor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={network}
            onChange={(event) => setNetwork(event.target.value as FassetsNetwork)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          >
            <option value="coston2">Coston2 (testnet)</option>
            <option value="flare">Flare (mainnet)</option>
          </select>
          <button
            onClick={() => load(network)}
            disabled={loading}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{error}</p>
      )}

      {overview && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-zinc-500 uppercase text-xs tracking-wider border-b border-zinc-800">
                <th className="py-2 pr-4">Agent vault</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Fee</th>
                <th className="py-2 pr-4">Vault ratio / floor</th>
                <th className="py-2 pr-4">Pool ratio / floor</th>
                <th className="py-2 pr-4">Minted FXRP</th>
                <th className="py-2 pr-4">Risk</th>
              </tr>
            </thead>
            <tbody>
              {overview.agents.map((agent) => {
                const risk = RISK_STYLES[agent.riskTier];
                return (
                  <tr key={agent.agentVault} className="border-b border-zinc-900">
                    <td className="py-3 pr-4 font-mono text-zinc-300">{shortenAddress(agent.agentVault)}</td>
                    <td className="py-3 pr-4 text-zinc-300">{agent.status}</td>
                    <td className="py-3 pr-4 text-zinc-400">{agent.feePercent.toFixed(2)}%</td>
                    <td className="py-3 pr-4 text-zinc-400">
                      {agent.vaultCollateralRatioPercent.toFixed(0)}% / {agent.mintingVaultCollateralRatioPercent.toFixed(0)}%
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">
                      {agent.poolCollateralRatioPercent.toFixed(0)}% / {agent.mintingPoolCollateralRatioPercent.toFixed(0)}%
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">{agent.mintedFxrp}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block border rounded-full px-3 py-1 text-xs font-semibold ${risk.className}`}>
                        {risk.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-zinc-600 text-xs mt-4">
            Showing {overview.agents.length} of {overview.totalAgents} available agents on {overview.network} · checked{" "}
            {new Date(overview.checkedAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </section>
  );
}
