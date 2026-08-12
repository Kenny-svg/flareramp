"use client";

import { useEffect, useState } from "react";
import {
  destinationLabel,
  type MintDestinationKind,
} from "@/lib/mintDestination";
import type { LiquidityOverview } from "@/lib/liquidityTypes";

const OPTIONS: MintDestinationKind[] = ["wallet", "firelight", "upshift"];

export interface MintDestinationChooserProps {
  value: MintDestinationKind;
  disabled?: boolean;
  onSelect: (kind: MintDestinationKind) => void;
}

/** Vault TVL keyed by destination, so a choice can be made on live depth. */
type TvlByDestination = Partial<Record<MintDestinationKind, string>>;

export function MintDestinationChooser({
  value,
  disabled,
  onSelect,
}: MintDestinationChooserProps) {
  const [tvl, setTvl] = useState<TvlByDestination>({});

  // Live vault depth is decision support at the moment of choosing, so it is
  // read here rather than only on a separate liquidity surface. Failure is
  // silent by design: TVL enriches the choice but must never block minting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/liquidity", { cache: "no-store" });
        if (!response.ok) return;
        const overview = (await response.json()) as LiquidityOverview;
        if (cancelled) return;
        const next: TvlByDestination = {};
        for (const node of overview.nodes) {
          const kind = node.protocol === "Firelight" ? "firelight" : "upshift";
          next[kind] = `${node.tvl} ${node.assetSymbol}`;
        }
        setTvl(next);
      } catch {
        /* TVL is supplementary — leave it blank rather than surfacing an error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <fieldset className="mb-6" disabled={disabled}>
      <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
        Destination after mint
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map((kind) => {
          const selected = value === kind;
          const vaultTvl = tvl[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onSelect(kind)}
              aria-pressed={selected}
              className={`text-left p-4 border transition-colors ${
                selected
                  ? "border-brand-500 bg-brand-950/20 text-white"
                  : "border-zinc-800 bg-zinc-950/40 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              <span className="block text-sm font-semibold">
                {destinationLabel(kind)}
              </span>
              <span className="mt-1 block text-xs text-zinc-500">
                {kind === "wallet"
                  ? "Mint FXRP to your Coston2 address"
                  : `Mint into a Smart Account and deposit to ${
                      kind === "firelight" ? "Firelight" : "Upshift"
                    }`}
              </span>
              {vaultTvl && (
                <span className="mt-2 block text-xs font-medium text-zinc-400">
                  Vault TVL: <span className="text-zinc-300">{vaultTvl}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
