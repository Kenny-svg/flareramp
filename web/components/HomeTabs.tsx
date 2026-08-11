"use client";

import { useState } from "react";
import { DirectMintSigning } from "./DirectMintSigning";
import { PortfolioDashboard } from "./PortfolioDashboard";

type TabId = "mint" | "portfolio";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "mint", label: "XRPL Testnet → Coston2 FXRP" },
  { id: "portfolio", label: "Portfolio & agent risk" },
];

/**
 * Replaces the mint flow's static eyebrow label with a tab switcher at the
 * same level, so "Portfolio & agent risk" sits alongside "XRPL Testnet →
 * Coston2 FXRP" instead of as a separate corner link. DirectMintSigning no
 * longer renders its own eyebrow line — this is now the single source of it.
 */
export function HomeTabs() {
  const [tab, setTab] = useState<TabId>("mint");

  return (
    <div>
      <div className="max-w-4xl mx-auto px-4 pt-12">
        <div
          role="tablist"
          aria-label="FlareRamp sections"
          className="flex flex-wrap gap-x-8 gap-y-2 border-b border-zinc-800/80 pb-3"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`font-extrabold text-sm tracking-wider uppercase transition-colors pb-1 ${
                tab === t.id
                  ? "text-brand-500 border-b-2 border-brand-500"
                  : "text-zinc-600 hover:text-zinc-400 border-b-2 border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "mint" ? <DirectMintSigning /> : <PortfolioDashboard />}
    </div>
  );
}
