export interface LiquidityNode {
  protocol: "Firelight" | "Upshift";
  vaultAddress: string;
  assetSymbol: string;
  /** Formatted TVL in the underlying asset (FXRP on Coston2). */
  tvl: string;
  tvlNumber: number;
  /**
   * "exact" = ERC-4626 `totalAssets()` (Firelight and registered Upshift).
   * "proxy" reserved for balance-of fallbacks if a non-4626 vault is added.
   */
  tvlSource: "exact" | "proxy";
  status: "active" | "paused";
  /** Share price proxy: assets per share, where shares data is available. */
  assetsPerShare: number | null;
  details: Record<string, string>;
}

export interface LiquidityOverview {
  network: "coston2";
  nodes: LiquidityNode[];
  checkedAt: string;
}
