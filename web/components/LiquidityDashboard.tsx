import { LiquidityMap } from "./LiquidityMap";

/**
 * Shared body for the Vaults tab (home page) and the standalone /liquidity
 * route — kept as one component so the two entry points can't drift apart
 * (same pattern as PortfolioDashboard).
 *
 * Scoped honestly as a vault explorer rather than an ecosystem-wide
 * "liquidity map": it reads the two Coston2 vaults FlareRamp can actually
 * mint into, with no APY and no mainnet data. The same TVL is surfaced
 * inline in the mint destination chooser, where it informs a real decision.
 */
export function LiquidityDashboard() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 flex flex-col gap-8">
      <header>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-4">
          FXRP mint destinations
        </h1>
        <p className="text-zinc-400 max-w-2xl leading-relaxed text-base md:text-lg">
          Live TVL and configuration for the Coston2 vaults FlareRamp can mint into, read directly
          from each vault contract — no signing, no transactions. Bubble size tracks TVL; select a
          vault to see its full configuration and check a specific address&apos;s balances and
          allowances against it. Coston2 only, and TVL only — no APY is shown because none is read
          on-chain.
        </p>
      </header>
      <LiquidityMap />
    </div>
  );
}
