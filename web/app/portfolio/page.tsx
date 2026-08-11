import { AgentRiskMonitor } from "@/components/AgentRiskMonitor";
import { CrossChainBalances } from "@/components/CrossChainBalances";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 flex flex-col gap-8">
      <header>
        <p className="text-brand-500 font-extrabold text-sm tracking-wider uppercase mb-2">Portfolio</p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-4">
          Agents &amp; cross-chain FXRP
        </h1>
        <p className="text-zinc-400 max-w-2xl leading-relaxed text-base md:text-lg">
          Live reads against Flare — no signing, no transactions. Agent collateral health backs the trust
          transparency story; cross-chain balances back the &quot;actually cross-chain&quot; portfolio story.
        </p>
      </header>
      <CrossChainBalances />
      <AgentRiskMonitor />
    </main>
  );
}
