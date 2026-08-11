import { LiquidityMap } from "./LiquidityMap";

/**
 * Shared body for the Liquidity Map tab (home page) and the standalone
 * /liquidity route — kept as one component so the two entry points can't
 * drift apart (same pattern as PortfolioDashboard).
 */
export function LiquidityDashboard() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 flex flex-col gap-8">
      <header>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-4">
          FXRP liquidity map
        </h1>
        <p className="text-zinc-400 max-w-2xl leading-relaxed text-base md:text-lg">
          Live TVL and configuration for every vault backing FXRP on Coston2, read directly from each
          vault contract — no signing, no transactions. Bubble size tracks TVL; select a vault to see its
          full configuration and check a specific address&apos;s balances and allowances against it.
        </p>
      </header>
      <LiquidityMap />
    </div>
  );
}
