"use client";

import type { LiquidityNode } from "@/lib/liquidityTypes";

export interface VaultDetailsModalProps {
  open: boolean;
  protocol: "Firelight" | "Upshift";
  node: LiquidityNode | null;
  loading: boolean;
  error: string | null;
  onProceed: () => void;
  onCancel: () => void;
}

export function VaultDetailsModal({
  open,
  protocol,
  node,
  loading,
  error,
  onProceed,
  onCancel,
}: VaultDetailsModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vault-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close vault details"
        className="absolute inset-0 bg-black/70"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-lg border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <h2
          id="vault-modal-title"
          className="text-xl font-bold text-white border-b border-zinc-800 pb-3 mb-4"
        >
          {protocol} vault details
        </h2>

        {loading && (
          <p className="text-sm text-zinc-400">Loading live vault data…</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {!loading && !error && node && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-500">
                Vault address
              </dt>
              <dd className="font-mono text-zinc-200 break-all">
                {node.vaultAddress}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-500">
                Status
              </dt>
              <dd className="text-zinc-200 capitalize">{node.status}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-500">
                TVL ({node.assetSymbol})
              </dt>
              <dd className="text-zinc-200">
                {node.tvl}
                {node.tvlSource === "proxy" ? " (proxy)" : ""}
              </dd>
            </div>
            {Object.entries(node.details).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wider text-zinc-500">
                  {key}
                </dt>
                <dd className="text-zinc-200 break-all">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-6 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold uppercase tracking-wider text-zinc-300 border border-zinc-700 hover:border-zinc-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onProceed}
            disabled={loading || Boolean(error) || !node}
            className="px-4 py-2 text-sm font-semibold uppercase tracking-wider text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-50"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
