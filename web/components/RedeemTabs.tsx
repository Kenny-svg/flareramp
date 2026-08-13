"use client";

import { useState } from "react";
import { AgentRiskMonitor } from "./AgentRiskMonitor";
import { ReverseRedeem } from "./ReverseRedeem";
import { SmartAccountActions } from "./SmartAccountActions";

type RedeemMode = "xaman" | "metamask";

/**
 * Redeem surface: XRPL-native Smart Account actions (primary) plus MetaMask
 * redeem for FXRP already held in an EOA, with agent-queue health beside the
 * MetaMask path (FIFO assignment affects that flow).
 */
export function RedeemTabs() {
  const [mode, setMode] = useState<RedeemMode>("xaman");

  return (
    <div>
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div
          role="tablist"
          aria-label="Redeem mode"
          className="flex flex-wrap gap-3"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "xaman"}
            onClick={() => setMode("xaman")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-colors ${
              mode === "xaman"
                ? "bg-brand-600 border-brand-500 text-white"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            XRPL / Xaman (zero-FLR)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "metamask"}
            onClick={() => setMode("metamask")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-colors ${
              mode === "metamask"
                ? "bg-brand-600 border-brand-500 text-white"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            MetaMask (EOA FXRP)
          </button>
        </div>
      </div>
      {mode === "xaman" ? (
        <SmartAccountActions />
      ) : (
        <div className="flex flex-col gap-8 pb-12">
          <ReverseRedeem />
          <div className="max-w-4xl mx-auto px-4 w-full">
            <AgentRiskMonitor />
          </div>
        </div>
      )}
    </div>
  );
}
