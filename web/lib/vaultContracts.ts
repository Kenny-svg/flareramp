/**
 * Minimal, live-verified ABIs for the two vault contracts backing the
 * Liquidity Map (lib/vaultDeployments.ts). Neither protocol ships a typed
 * ABI package the way Flare's own periphery contracts do, so these are kept
 * deliberately narrow — only functions that were called and confirmed live
 * on Coston2 during implementation, nothing guessed.
 */

/**
 * Firelight's stXRP vault reads as a standard ERC-4626-style surface
 * (confirmed live: symbol "stXRP", asset() resolves to the real Coston2
 * FXRP token, totalAssets()/totalSupply() both return sane values).
 */
export const FIRELIGHT_VAULT_ABI = [
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

/**
 * Upshift's `ITokenizedVault` — sourced directly from Upshift's own
 * `scripts/upshift/vault-status.ts` status script (not a guess). It is NOT
 * ERC-4626: shares live on a separate `lpTokenAddress()` token, and there is
 * no `totalAssets()` — TVL is read as the vault's own balance of its
 * reference asset instead (see lib/server/liquidityMap.ts).
 */
export const UPSHIFT_VAULT_ABI = [
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "lpTokenAddress", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "withdrawalsPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "lagDuration", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "withdrawalFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "instantRedemptionFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxWithdrawalAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getWithdrawalEpoch",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
  },
] as const;
