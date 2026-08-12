"use client";

import { useEffect, useState } from "react";
import { isAddress } from "viem";
import type { LiquidityNode, LiquidityOverview } from "@/lib/server/liquidityMap";
import type { VaultPosition } from "@/lib/server/vaultPosition";

const VIEW_W = 640;
const VIEW_H = 560;
const CENTER = { x: VIEW_W / 2, y: VIEW_H / 2 };
const HUB_RADIUS = 46;
const GOLDEN_ANGLE_DEG = 137.508;

const STATUS_COLOR: Record<LiquidityNode["status"], string> = {
  active: "#34d399",
  paused: "#f59e0b",
};

/** Deterministic 0..1 hash so node placement is stable across reloads/refreshes instead of reshuffling. */
function hashToUnit(input: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < input.length; i++) h = (Math.imul(h, 31) + input.charCodeAt(i)) | 0;
  return ((h >>> 0) % 10000) / 10000;
}

interface PlacedNode {
  node: LiquidityNode;
  x: number;
  y: number;
  r: number;
}

/**
 * Organic bubble layout: nodes fan out from the FXRP hub at golden-angle
 * increments (avoids the "spokes on a wheel" look of evenly-spaced angles),
 * with per-node jitter seeded from the vault address so the scatter is
 * stable rather than re-randomizing on every refresh. Bubble radius scales
 * with sqrt(TVL share) so size reads as area, not raw radius. Orbit radius
 * is derived per-node from HUB_RADIUS + that node's own bubble radius, so a
 * large-TVL bubble can never overlap the hub the way a fixed orbit distance
 * would.
 */
function layoutNodes(nodes: LiquidityNode[]): PlacedNode[] {
  const maxTvl = Math.max(1, ...nodes.map((n) => n.tvlNumber));
  return nodes.map((node, i) => {
    const angleJitter = (hashToUnit(node.vaultAddress, 1) - 0.5) * 46;
    const radiusJitter = hashToUnit(node.vaultAddress, 2) * 12;
    const angleDeg = i * GOLDEN_ANGLE_DEG + angleJitter - 90;
    const angleRad = (angleDeg * Math.PI) / 180;
    const depth = Math.sqrt(Math.max(node.tvlNumber, 0) / maxTvl);
    const r = 26 + depth * 26;
    // True circular placement — a y-axis squash here would shrink the real
    // center-to-center distance for nodes near vertical angles, undermining
    // the overlap-safety margin below (learned the hard way: Firelight's
    // large bubble clipped the hub when this was compressed by 0.78).
    const orbit = HUB_RADIUS + r + 58 + i * 46 + radiusJitter;
    return {
      node,
      x: CENTER.x + orbit * Math.cos(angleRad),
      y: CENTER.y + orbit * Math.sin(angleRad),
      r,
    };
  });
}

function curvedPath(x1: number, y1: number, x2: number, y2: number, bend: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bend;
  const cy = my + (dx / len) * bend;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  cx: (hashToUnit(`p${i}`, 11) * 0.86 + 0.07) * VIEW_W,
  cy: (hashToUnit(`p${i}`, 23) * 0.86 + 0.07) * VIEW_H,
  r: 1.4 + hashToUnit(`p${i}`, 37) * 2.2,
  delay: hashToUnit(`p${i}`, 41) * 6,
  duration: 5 + hashToUnit(`p${i}`, 53) * 5,
}));

/**
 * Liquidity Map — Firelight and Upshift vault TVL on Coston2, read live via
 * app/api/liquidity (lib/server/liquidityMap.ts). Coston2-only per current
 * scope; SparkDEX isn't included — no verified FXRP pool address for it yet.
 *
 * Both registered Coston2 vaults expose ERC-4626 `totalAssets()` for TVL.
 */
export function LiquidityMap() {
  const [overview, setOverview] = useState<LiquidityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [positionAddress, setPositionAddress] = useState("");
  const [position, setPosition] = useState<VaultPosition | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);

  function selectNode(vaultAddress: string | null) {
    setSelected(vaultAddress);
    setPosition(null);
    setPositionError(null);
  }

  async function loadPosition(vaultAddress: string) {
    if (!isAddress(positionAddress)) {
      setPositionError("Enter a valid EVM address (0x...)");
      return;
    }
    setPositionLoading(true);
    setPositionError(null);
    try {
      const response = await fetch(`/api/liquidity/position?vault=${vaultAddress}&address=${positionAddress}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load vault position");
      setPosition(body as VaultPosition);
    } catch (err) {
      setPositionError(err instanceof Error ? err.message : "Could not load vault position");
      setPosition(null);
    } finally {
      setPositionLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/liquidity", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load liquidity overview");
      setOverview(body as LiquidityOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load liquidity overview");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const nodes = overview?.nodes ?? [];
  const placed = layoutNodes(nodes);
  const selectedNode = nodes.find((n) => n.vaultAddress === selected) ?? null;

  return (
    <section className="relative bg-zinc-900/30 border border-zinc-800/80 backdrop-blur-md p-6 md:p-8 rounded-3xl shadow-xl overflow-hidden">
      <style>{`
        @keyframes lm-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .lm-particle { transform-box: fill-box; transform-origin: center; animation: lm-float 6s ease-in-out infinite; }
        .lm-node-circle { transition: r 200ms ease, stroke-width 200ms ease, filter 200ms ease; }
        .lm-node-group { cursor: pointer; }
        .lm-live-dot { animation: lm-float 2.4s ease-in-out infinite; }
      `}</style>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
            Liquidity Map
            {!loading && !error && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Live
              </span>
            )}
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Live FXRP TVL across Firelight and Upshift on Coston2. Bubble size ∝ TVL — click a node for details.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{error}</p>
      )}

      {nodes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div>
            <svg width="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="FXRP liquidity map">
              <defs>
                <radialGradient id="lm-bg" cx="50%" cy="46%" r="65%">
                  <stop offset="0%" stopColor="#27272a" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#09090b" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="lm-hub-grad" cx="35%" cy="30%" r="75%">
                  <stop offset="0%" stopColor="#ff7454" />
                  <stop offset="100%" stopColor="#b13010" />
                </radialGradient>
                <radialGradient id="lm-node-grad" cx="35%" cy="30%" r="75%">
                  <stop offset="0%" stopColor="#3f3f46" />
                  <stop offset="100%" stopColor="#0a0a0a" />
                </radialGradient>
                <pattern id="lm-dots" width="26" height="26" patternUnits="userSpaceOnUse">
                  <circle cx="1.4" cy="1.4" r="1.4" fill="#3f3f46" opacity="0.4" />
                </pattern>
              </defs>

              <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#lm-dots)" />
              <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#lm-bg)" />

              {PARTICLES.map((p, i) => (
                <circle
                  key={i}
                  className="lm-particle"
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                  fill="#e85d35"
                  opacity={0.28}
                  style={{ animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
                />
              ))}

              {placed.map(({ node, x, y, r }, i) => {
                const color = STATUS_COLOR[node.status];
                const dx = x - CENTER.x;
                const dy = y - CENTER.y;
                const dist = Math.hypot(dx, dy) || 1;
                const ux = dx / dist;
                const uy = dy / dist;
                const bend = (i % 2 === 0 ? 1 : -1) * (22 + i * 5);
                const path = curvedPath(
                  CENTER.x + ux * HUB_RADIUS,
                  CENTER.y + uy * HUB_RADIUS,
                  x - ux * r,
                  y - uy * r,
                  bend,
                );
                const isActiveLink = selected === node.vaultAddress || hovered === node.vaultAddress;
                return (
                  <path
                    key={node.vaultAddress}
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={isActiveLink ? 2.4 : 1.4}
                    strokeLinecap="round"
                    strokeDasharray="7 6"
                    opacity={isActiveLink ? 0.85 : 0.4}
                    style={{ transition: "stroke-width 200ms ease, opacity 200ms ease" }}
                  >
                    <animate attributeName="stroke-dashoffset" values="26;0" dur="1.6s" repeatCount="indefinite" />
                  </path>
                );
              })}

              {/* Hub */}
              <circle cx={CENTER.x} cy={CENTER.y} r={HUB_RADIUS + 16} fill="#e85d35" opacity={0.22} style={{ filter: "blur(16px)" }} />
              <circle cx={CENTER.x} cy={CENTER.y} r={HUB_RADIUS} fill="url(#lm-hub-grad)" stroke="#ffd2c7" strokeOpacity={0.4} strokeWidth={1.5} />
              <text x={CENTER.x} y={CENTER.y - 2} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fff">
                FXRP
              </text>
              <text x={CENTER.x} y={CENTER.y + 14} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#ffe4da" opacity={0.85}>
                COSTON2
              </text>

              {placed.map(({ node, x, y, r }) => {
                const color = STATUS_COLOR[node.status];
                const isSelected = selected === node.vaultAddress;
                const isHovered = hovered === node.vaultAddress;
                const displayR = isSelected ? r * 1.1 : isHovered ? r * 1.05 : r;
                return (
                  <g
                    key={node.vaultAddress}
                    className="lm-node-group"
                    onClick={() => selectNode(isSelected ? null : node.vaultAddress)}
                    onMouseEnter={() => setHovered(node.vaultAddress)}
                    onMouseLeave={() => setHovered((h) => (h === node.vaultAddress ? null : h))}
                  >
                    <circle cx={x} cy={y} r={displayR + 12} fill={color} opacity={isSelected ? 0.28 : 0.16} style={{ filter: "blur(12px)" }} />
                    {node.status === "active" && (
                      <circle cx={x} cy={y} r={displayR} fill="none" stroke={color} strokeWidth={1.4} opacity={0.55}>
                        <animate attributeName="r" values={`${displayR};${displayR + 16};${displayR}`} dur="3.2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.5;0;0.5" dur="3.2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      className="lm-node-circle"
                      cx={x}
                      cy={y}
                      r={displayR}
                      fill="url(#lm-node-grad)"
                      stroke={color}
                      strokeWidth={isSelected ? 2.6 : 1.8}
                      strokeDasharray={node.status === "paused" ? "4 3" : undefined}
                    />
                    <text x={x} y={y - 3} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#f4f4f5">
                      {node.protocol}
                    </text>
                    <text x={x} y={y + 11} textAnchor="middle" fontSize={9} fontWeight={600} fill={color}>
                      {node.tvl}
                    </text>
                    <text x={x} y={y + displayR + 18} textAnchor="middle" fontSize={9.5} fill="#71717a">
                      {node.status === "paused" ? "withdrawals paused" : "active"}
                      {node.tvlSource === "proxy" ? " · proxy TVL" : ""}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-1 px-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR.active }} />
                Active
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full border border-dashed" style={{ borderColor: STATUS_COLOR.paused }} />
                Withdrawals paused
              </span>
              <span>Bubble size ∝ TVL</span>
            </div>
          </div>

          <div>
            {!selectedNode && (
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-6 text-center">
                <p className="text-zinc-500 text-sm">Select a node on the left to see full vault details.</p>
              </div>
            )}
            {selectedNode && (
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[selectedNode.status] }} />
                  <h3 className="text-white font-bold">{selectedNode.protocol}</h3>
                </div>
                <p className="text-zinc-500 text-xs font-mono mb-3">{selectedNode.vaultAddress}</p>
                <dl className="text-sm space-y-1.5">
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">TVL {selectedNode.tvlSource === "proxy" && "(proxy)"}</dt>
                    <dd className="text-zinc-200">
                      {selectedNode.tvl} {selectedNode.assetSymbol}
                    </dd>
                  </div>
                  {selectedNode.assetsPerShare !== null && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Assets / share</dt>
                      <dd className="text-zinc-200">{selectedNode.assetsPerShare.toFixed(4)}</dd>
                    </div>
                  )}
                  {Object.entries(selectedNode.details).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-4">
                      <dt className="text-zinc-500">{key}</dt>
                      <dd className="text-zinc-200 text-right">{value}</dd>
                    </div>
                  ))}
                </dl>
                {selectedNode.tvlSource === "proxy" && (
                  <p className="text-zinc-600 text-xs mt-3">
                    TVL is this vault&apos;s own balance of {selectedNode.assetSymbol} — a proxy, not a dedicated
                    totalAssets() read. Could understate TVL if the vault deploys capital elsewhere.
                  </p>
                )}

                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <h4 className="text-white font-semibold text-sm mb-1">My position</h4>
                  <p className="text-zinc-500 text-xs mb-3">
                    Your balances and allowances against this vault. No wallet-connect in this app — paste an
                    address to read it live.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={positionAddress}
                      onChange={(event) => setPositionAddress(event.target.value.trim())}
                      placeholder="0x… EVM address"
                      className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-zinc-700 font-mono text-xs"
                    />
                    <button
                      onClick={() => loadPosition(selectedNode.vaultAddress)}
                      disabled={positionLoading || !positionAddress}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold px-4 py-2 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                    >
                      {positionLoading ? "Loading…" : "Load position"}
                    </button>
                  </div>

                  {positionError && (
                    <p className="text-red-400 text-xs mt-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                      {positionError}
                    </p>
                  )}

                  {position && position.vaultAddress.toLowerCase() === selectedNode.vaultAddress.toLowerCase() && (
                    <dl className="text-sm space-y-1.5 mt-3">
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">{position.assetSymbol} balance</dt>
                        <dd className="text-zinc-200">{position.assetBalance}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">{position.assetSymbol} allowance to vault</dt>
                        <dd className="text-zinc-200">{position.assetAllowanceToVault}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">{position.shareSymbol} balance</dt>
                        <dd className="text-zinc-200">{position.shareBalance}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">{position.shareSymbol} allowance to vault</dt>
                        <dd className="text-zinc-200">{position.shareAllowanceToVault}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {overview && <p className="text-zinc-600 text-xs mt-4">checked {new Date(overview.checkedAt).toLocaleTimeString()}</p>}
    </section>
  );
}
