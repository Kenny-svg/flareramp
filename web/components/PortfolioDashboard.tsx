import { AgentRiskMonitor } from "./AgentRiskMonitor";
import { CrossChainBalances } from "./CrossChainBalances";

/**
 * Shared body for the Portfolio tab (home page) and the standalone
 * /portfolio route — kept as one component so the two entry points can't
 * drift apart.
 */
export function PortfolioDashboard() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col gap-8">
      <header>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-4">
          Agents &amp; cross-chain FXRP
        </h1>
        <p className="text-zinc-400 max-w-2xl leading-relaxed text-base md:text-lg">
          Live reads against Flare — no signing, no transactions. Cross-chain balances back the
          &quot;actually cross-chain&quot; portfolio story; agent collateral health is a supplementary trust
          signal for FXRP&apos;s overall backing, not a per-mint detail (FlareRamp&apos;s mint flow pays the
          shared Core Vault, not any one agent).
        </p>
      </header>
      <CrossChainBalances />
      <AgentRiskMonitor />
    </div>
  );
}
