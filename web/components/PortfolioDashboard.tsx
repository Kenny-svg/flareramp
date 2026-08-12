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
          Cross-chain FXRP
        </h1>
        <p className="text-zinc-400 max-w-2xl leading-relaxed text-base md:text-lg">
          FXRP is a LayerZero OFT: one supply, many chains. This reads a single address&apos;s balance
          on the FAssets chain and on every chain where the OFT is deployed — live, no signing, no
          transactions. Agent collateral health now sits in the Redeem tab, where the agent queue
          actually affects what you are about to do.
        </p>
      </header>
      <CrossChainBalances />
    </div>
  );
}
