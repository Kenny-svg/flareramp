"use client";

/**
 * Liquidity Map — network graph of where FXRP liquidity sits across Flare
 * DeFi protocols. Central node = FXRP; connected nodes = protocols/pools.
 *
 * PLACEHOLDER DATA. Do not demo this without replacing `PLACEHOLDER_NODES`
 * with real reads. Two things need to happen first:
 *   1. Confirm which protocols (SparkDEX, Firelight, Upshift, any lending
 *      market) actually have FXRP liquidity deployed, and on which network —
 *      see README.md "Network model" (Coston2 testnet liquidity may not
 *      exist; plan is to read Mainnet for this view).
 *   2. Wire up real pool-depth/APY reads per protocol (each has its own ABI —
 *      don't hand-roll those either, pull from the protocol's own docs/SDK).
 *
 * Rendered as plain SVG (no chart library dependency) — swap in a proper
 * force-directed layout (e.g. react-force-graph) once there's real data with
 * enough nodes to need it.
 */

interface LiquidityNode {
  protocol: string;
  /** 0-1, drives line thickness. */
  depthScore: number;
  /** drives node/line color. */
  riskTier: "stable" | "elevated";
  apyPercent: number;
}

const PLACEHOLDER_NODES: LiquidityNode[] = [
  { protocol: "SparkDEX (FXRP/USDT0)", depthScore: 0.8, riskTier: "stable", apyPercent: 4.2 },
  { protocol: "Firelight (stXRP)", depthScore: 0.5, riskTier: "stable", apyPercent: 6.1 },
  { protocol: "Upshift Vault", depthScore: 0.3, riskTier: "elevated", apyPercent: 11.4 },
];

const CENTER = { x: 200, y: 200 };
const RADIUS = 140;

export function LiquidityMap() {
  return (
    <section>
      <h2>Liquidity Map</h2>
      <p>
        Pool depth and APY are read from Flare Mainnet — Coston2 doesn&apos;t have meaningful DEX
        liquidity to show. Mint, deposit, and redeem actions still run on Coston2 testnet.
      </p>
      <p style={{ color: "darkorange" }}>
        Placeholder data below — see the component file header before demoing this.
      </p>
      <svg width={400} height={400} role="img" aria-label="FXRP liquidity map">
        {PLACEHOLDER_NODES.map((node, i) => {
          const angle = (i / PLACEHOLDER_NODES.length) * 2 * Math.PI;
          const x = CENTER.x + RADIUS * Math.cos(angle);
          const y = CENTER.y + RADIUS * Math.sin(angle);
          const color = node.riskTier === "stable" ? "seagreen" : "darkorange";
          return (
            <g key={node.protocol}>
              <line
                x1={CENTER.x}
                y1={CENTER.y}
                x2={x}
                y2={y}
                stroke={color}
                strokeWidth={1 + node.depthScore * 6}
              />
              <circle cx={x} cy={y} r={18} fill={color} />
              <text x={x} y={y + 32} textAnchor="middle" fontSize={11}>
                {node.protocol}
              </text>
              <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fill="white">
                {node.apyPercent}%
              </text>
            </g>
          );
        })}
        <circle cx={CENTER.x} cy={CENTER.y} r={28} fill="#333" />
        <text x={CENTER.x} y={CENTER.y + 4} textAnchor="middle" fontSize={12} fill="white">
          FXRP
        </text>
      </svg>
    </section>
  );
}
