"use client";

import {
  destinationLabel,
  type MintDestinationKind,
} from "@/lib/mintDestination";

const OPTIONS: MintDestinationKind[] = ["wallet", "firelight", "upshift"];

export interface MintDestinationChooserProps {
  value: MintDestinationKind;
  disabled?: boolean;
  onSelect: (kind: MintDestinationKind) => void;
}

export function MintDestinationChooser({
  value,
  disabled,
  onSelect,
}: MintDestinationChooserProps) {
  return (
    <fieldset className="mb-6" disabled={disabled}>
      <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
        Destination after mint
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map((kind) => {
          const selected = value === kind;
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
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
