/**
 * Firelight / Upshift vault deployments powering the Liquidity Map and
 * mint-and-deposit destinations. Coston2-only — this app is testnet-first.
 *
 * Both addresses are registered in MasterAccountController.getVaults() and
 * expose an ERC-4626 deposit surface used by Smart Accounts custom
 * instructions (`deposit(uint256 assets, address receiver)`).
 *
 * - Firelight: vault id 1, type 1
 * - Upshift: vault id 2 (TESTearnxRP) — the prior ITokenizedVault address
 *   `0x24c1a47c…` is not registered and its `deposit(address,uint256)`
 *   reverts immediately, which caused CallFailed on mint+deposit.
 */
export interface VaultDeployment {
  protocol: "Firelight" | "Upshift";
  vaultAddress: `0x${string}`;
}

export const COSTON2_VAULT_DEPLOYMENTS: VaultDeployment[] = [
  { protocol: "Firelight", vaultAddress: "0xC90D6847747b85d1fa2E07859869fb9fB72c0361" },
  { protocol: "Upshift", vaultAddress: "0x9E63a5D282F2fBb7DcE822B98e363b2719D28319" },
];
