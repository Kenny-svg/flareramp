/**
 * FXRP LayerZero OFT deployments — powers the cross-chain portfolio view.
 *
 * FXRP is deployed as an OFT Adapter on Flare (locks/unlocks) and as native
 * OFT contracts on each destination chain (mint/burn), with total supply
 * unified across chains. See flare-fassets skill, "FXRP Cross-Chain (OFT)".
 *
 * IMPORTANT: do NOT trust the addresses/chain IDs below for anything beyond
 * local scaffolding. Verify every one against
 * https://dev.flare.network/fxrp/oft (or a block explorer) before wiring up
 * real balance reads — OFT deployments can change, and getting a contract
 * address wrong here would silently show the wrong balance to a user.
 */

export interface OftDeployment {
  chainName: string;
  /** EVM chain id, where confirmed. `null` means: confirm before use, don't guess. */
  chainId: number | null;
  /** OFT (or OFT Adapter, on Flare) contract address. `null` = must be looked up, not hardcoded. */
  fxrpOftAddress: `0x${string}` | null;
  /** true on Flare (lock/unlock adapter), false elsewhere (native mint/burn OFT). */
  isAdapter: boolean;
}

export const FXRP_OFT_DEPLOYMENTS: OftDeployment[] = [
  { chainName: "Flare", chainId: 14, fxrpOftAddress: null, isAdapter: true },
  { chainName: "Ethereum Mainnet", chainId: 1, fxrpOftAddress: null, isAdapter: false },
  { chainName: "Base", chainId: 8453, fxrpOftAddress: null, isAdapter: false },
  { chainName: "BNB Smart Chain", chainId: 56, fxrpOftAddress: null, isAdapter: false },
  // Monad and HyperEVM/HyperCore chain IDs are not included here — confirm
  // current values against https://dev.flare.network/fxrp/oft before adding
  // rather than guessing (Monad in particular has changed testnet/mainnet
  // chain ids during its rollout).
  { chainName: "Monad", chainId: null, fxrpOftAddress: null, isAdapter: false },
  { chainName: "HyperEVM", chainId: null, fxrpOftAddress: null, isAdapter: false },
  { chainName: "Katana", chainId: null, fxrpOftAddress: null, isAdapter: false },
];
