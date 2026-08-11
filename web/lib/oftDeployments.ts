/**
 * FXRP LayerZero OFT deployments — powers the cross-chain portfolio view.
 *
 * FXRP is deployed as an OFT Adapter on Flare (locks/unlocks the existing
 * FXRP ERC-20) and as native OFT contracts on each destination chain
 * (mint/burn), with total supply unified across chains. See flare-fassets
 * skill, "FXRP Cross-Chain (OFT)".
 *
 * Flare is deliberately NOT listed here: the OFT Adapter contract on Flare
 * only locks/unlocks — it does not hold user balances and reverts on
 * `symbol()`/`decimals()` (confirmed live). The actual FXRP balance on Flare
 * lives on the FXRP ERC-20 token, which must be resolved dynamically via
 * `getFxrpTokenAddress()` in contracts.ts (never hardcoded — see that file).
 * `lib/server/crossChainBalances.ts` handles the Flare row separately for
 * this reason.
 *
 * Every address below was live-verified during implementation (2026-08-11)
 * by checking `getBytecode` is non-empty and `symbol() == "FXRP"`,
 * `decimals() == 6` against the destination chain's public RPC — not copied
 * blind from docs. Re-verify against https://dev.flare.network/fxrp/oft or a
 * block explorer if this file is touched again later, since OFT deployments
 * can change.
 */

export interface OftDeployment {
  chainName: string;
  /** EVM chain id, where confirmed. `null` means: confirm before use, don't guess. */
  chainId: number | null;
  /** Native OFT contract address (mint/burn model — this chain is not Flare). `null` = must be looked up, not hardcoded. */
  fxrpOftAddress: `0x${string}` | null;
}

export const FXRP_OFT_DEPLOYMENTS: OftDeployment[] = [
  { chainName: "Ethereum Mainnet", chainId: 1, fxrpOftAddress: "0xce6170ea245dc8d1f275a710a062b70f125f0110" },
  { chainName: "Base", chainId: 8453, fxrpOftAddress: "0xCE6170EA245dC8D1f275A710a062b70f125F0110" },
  { chainName: "BNB Smart Chain", chainId: 56, fxrpOftAddress: "0xCE6170EA245dC8D1f275A710a062b70f125F0110" },
  { chainName: "HyperEVM", chainId: 999, fxrpOftAddress: "0xd70659a6396285BF7214d7Ea9673184e7C72E07E" },
  { chainName: "Katana", chainId: 747474, fxrpOftAddress: "0x565f9415b9c285c03c008e73088148f28d218059" },
  // Monad and HyperCore: not live-verified during implementation (Monad's
  // current mainnet address wasn't confirmed against a second source, and
  // HyperCore is a non-EVM Hyperliquid L1 with a different balance model —
  // both need dedicated verification, not a guess). Confirm against
  // https://dev.flare.network/fxrp/oft before adding.
  { chainName: "Monad", chainId: null, fxrpOftAddress: null },
  { chainName: "HyperCore", chainId: null, fxrpOftAddress: null },
];
