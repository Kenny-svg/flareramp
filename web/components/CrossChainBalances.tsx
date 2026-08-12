"use client";

import { useState } from "react";
import { isAddress } from "viem";
import type { CrossChainBalancesResult } from "@/lib/server/crossChainBalances";

type FassetsNetwork = "coston2" | "flare";

/**
 * Cross-chain FXRP balance rollup — the feature that makes "Cross-Chain
 * Portfolio" (the product name) actually true, instead of a Flare-only view.
 * Backed by app/api/portfolio/balances, which reads the FXRP ERC-20 on the
 * selected network's own chain directly (the OFT Adapter there holds no user
 * balances) and the native LayerZero OFT contracts on every other chain in
 * lib/oftDeployments.ts. Defaults to Coston2 — this app is testnet-first.
 *
 * No wallet-connect flow exists in this app yet (XRPL/Xaman signing only —
 * see DirectMintSigning.tsx), so this takes a pasted EVM address rather than
 * pretending to read one from a connected wallet.
 */
export function CrossChainBalances() {
  const [network, setNetwork] = useState<FassetsNetwork>("coston2");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<CrossChainBalancesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    if (!isAddress(input)) {
      setError("Enter a valid EVM address (0x...)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/portfolio/balances?address=${input}&network=${network}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load cross-chain balances");
      setResult(body as CrossChainBalancesResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cross-chain balances");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-zinc-900/30 border border-zinc-800/80 backdrop-blur-md p-6 rounded-2xl shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-1">
        <div>
          <h2 className="text-xl font-black tracking-tight text-white">Cross-Chain FXRP</h2>
          <p className="text-zinc-400 text-sm mt-1">
            FXRP balance on {network === "coston2" ? "Coston2" : "Flare"} plus every chain where its LayerZero OFT
            is deployed.
          </p>
        </div>
        <select
          value={network}
          onChange={(event) => {
            setNetwork(event.target.value as FassetsNetwork);
            setResult(null);
          }}
          className="bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
        >
          <option value="coston2">Coston2 (testnet)</option>
          <option value="flare">Flare (mainnet)</option>
        </select>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4 mt-4">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value.trim())}
          placeholder="0x… EVM address"
          className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-zinc-700 font-mono text-sm"
        />
        <button
          onClick={loadAll}
          disabled={loading || !input}
          className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wider"
        >
          {loading ? "Loading…" : "Load balances"}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{error}</p>
      )}

      {result && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-zinc-500 uppercase text-xs tracking-wider border-b border-zinc-800">
                <th className="py-2 pr-4">Chain</th>
                <th className="py-2 pr-4">FXRP</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.chainName} className="border-b border-zinc-900">
                  <td className="py-3 pr-4 text-zinc-300">{row.chainName}</td>
                  <td className="py-3 pr-4 text-zinc-400">
                    {row.status === "loaded" && row.balance}
                    {row.status === "not-configured" && (
                      <span className="text-zinc-600">not configured — see lib/oftDeployments.ts</span>
                    )}
                    {row.status === "error" && <span className="text-red-400">error</span>}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-3 pr-4 font-bold text-white">Total</td>
                <td className="py-3 pr-4 font-bold text-white">{result.totalFxrp} FXRP</td>
              </tr>
            </tbody>
          </table>
          <p className="text-zinc-600 text-xs mt-4">checked {new Date(result.checkedAt).toLocaleTimeString()}</p>
        </div>
      )}
    </section>
  );
}
