/**
 * Firelight / Upshift vault deployments powering the Liquidity Map.
 * Coston2-only — this app is testnet-first and neither vault's mainnet
 * address has been supplied/verified.
 *
 * Verification performed during implementation (2026-08-11):
 * - Firelight: confirmed registered in MasterAccountController.getVaults()
 *   (id=1, type=1) AND responds to a standard ERC-4626-style read surface
 *   (symbol/decimals/totalSupply/totalAssets/asset all resolve cleanly).
 * - Upshift: address supplied directly by the user from Upshift's own
 *   `ITokenizedVault` status script (not a guess) — confirmed live against
 *   that exact interface (asset/lpTokenAddress/withdrawalsPaused/
 *   lagDuration/withdrawalFee/instantRedemptionFee/maxWithdrawalAmount/
 *   getWithdrawalEpoch all resolve). It is NOT registered in
 *   MasterAccountController.getVaults() — that registry is scoped to Smart
 *   Accounts routing, not a general vault directory, so its absence there
 *   doesn't contradict this address.
 */
export interface VaultDeployment {
  protocol: "Firelight" | "Upshift";
  vaultAddress: `0x${string}`;
}

export const COSTON2_VAULT_DEPLOYMENTS: VaultDeployment[] = [
  { protocol: "Firelight", vaultAddress: "0xC90D6847747b85d1fa2E07859869fb9fB72c0361" },
  { protocol: "Upshift", vaultAddress: "0x24c1a47cD5e8473b64EAB2a94515a196E10C7C81" },
];
