import { defineChain } from "viem";
import { mainnet, base, bsc } from "viem/chains";

// Interactive actions (mint/redeem/deposit/Smart Accounts) happen here.
export const coston2 = defineChain({
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] },
  },
  blockExplorers: {
    default: { name: "Coston2 Explorer", url: "https://coston2-explorer.flare.network" },
  },
  testnet: true,
});

// Read-only source for the Liquidity Map and cross-chain portfolio balances —
// see README.md "Network model" for why reads and writes are split like this.
export const flareMainnet = defineChain({
  id: 14,
  name: "Flare",
  nativeCurrency: { name: "Flare", symbol: "FLR", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://flare-api.flare.network/ext/C/rpc"] },
  },
  blockExplorers: {
    default: { name: "Flare Explorer", url: "https://flare-explorer.flare.network" },
  },
});

export const supportedChains = [coston2, flareMainnet] as const;

/**
 * Chains where the FXRP LayerZero OFT is deployed, for the cross-chain
 * portfolio view (lib/oftDeployments.ts). `mainnet`/`base`/`bsc` are viem's
 * own maintained chain definitions — safer than hand-rolling nativeCurrency
 * fields. HyperEVM and Katana have no viem builtin, so they're hand-defined
 * here from RPC endpoints that were live-verified (contract code present,
 * `symbol() == "FXRP"`, `decimals() == 6`) against the addresses in
 * oftDeployments.ts during implementation — see that file for the addresses.
 */
export { mainnet as ethereumMainnet, base, bsc as bnbSmartChain };

export const hyperEvm = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.hyperliquid.xyz/evm"] },
  },
});

export const katana = defineChain({
  id: 747474,
  name: "Katana",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.katana.network"] },
  },
});

// Testnet route: the FXRP OFT docs describe only Coston2 <-> Hyperliquid
// Testnet as a live testnet route today. Coston2 itself isn't listed here —
// like Flare mainnet, its OFT Adapter only locks/unlocks (verified live: it
// reverts on symbol()/decimals()), so its balance is read from the real
// Coston2 FXRP ERC-20 via getFxrpTokenAddress(), not this chain list.
export const hyperliquidTestnet = defineChain({
  id: 998,
  name: "Hyperliquid Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.hyperliquid-testnet.xyz/evm"] },
  },
  testnet: true,
});
