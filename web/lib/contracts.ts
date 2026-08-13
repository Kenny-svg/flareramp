import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { coston2, flareMainnet } from "./chains";

// Same address on every Flare network — the trusted entry point for resolving
// everything else. Never hardcode AssetManager / FXRP / MasterAccountController
// addresses; always resolve them through this registry.
export const FLARE_CONTRACTS_REGISTRY: Address = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

const REGISTRY_ABI = [
  {
    type: "function",
    name: "getContractAddressByName",
    stateMutability: "view",
    inputs: [{ name: "_name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export function getPublicClient(network: "coston2" | "flare"): PublicClient {
  const chain = network === "coston2" ? coston2 : flareMainnet;
  return createPublicClient({ chain, transport: http() });
}

/**
 * Resolves any Flare periphery contract address by its registry name, e.g.
 * "AssetManagerFXRP", "FtsoV2", "MasterAccountController".
 *
 * See https://dev.flare.network/network/guides/flare-contracts-registry
 */
export async function resolveContractAddress(
  network: "coston2" | "flare",
  name: string
): Promise<Address> {
  const client = getPublicClient(network);
  return client.readContract({
    address: FLARE_CONTRACTS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "getContractAddressByName",
    args: [name],
  });
}

export async function getFxrpAssetManagerAddress(network: "coston2" | "flare") {
  return resolveContractAddress(network, "AssetManagerFXRP");
}

export async function getMasterAccountControllerAddress(network: "coston2" | "flare") {
  return resolveContractAddress(network, "MasterAccountController");
}

const FASSET_ABI = [
  {
    type: "function",
    name: "fAsset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export async function getFxrpTokenAddress(network: "coston2" | "flare") {
  const client = getPublicClient(network);
  const assetManager = await getFxrpAssetManagerAddress(network);
  return client.readContract({
    address: assetManager,
    abi: FASSET_ABI,
    functionName: "fAsset",
  });
}

/**
 * MasterAccountController — the Smart Accounts entry point.
 *
 * Function names and rough shapes come directly from the flare-smart-accounts
 * skill's TypeScript example (getPersonalAccount/getNonce/getXrplProviderWallets
 * are all shown being read via viem `readContract`). `getPersonalAccount`'s
 * types are given explicitly in that example (xrplAddress in, Flare address
 * out) so it's safe as written. `getNonce` (uint256) and
 * `getXrplProviderWallets` (string[], since XRPL addresses aren't EVM
 * addresses) are inferred from context, not confirmed byte-for-byte against
 * the real ABI — verify against the deployed contract or
 * @flarenetwork/flare-wagmi-periphery-package before shipping.
 */
export const MASTER_ACCOUNT_CONTROLLER_ABI = [
  {
    type: "function",
    name: "getPersonalAccount",
    stateMutability: "view",
    inputs: [{ name: "xrplAddress", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [{ name: "personalAccount", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getXrplProviderWallets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string[]" }],
  },
  {
    type: "function",
    name: "getInstructionFee",
    stateMutability: "view",
    inputs: [{ name: "_instructionId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getDefaultInstructionFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getVaults",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "_vaultIds", type: "uint256[]" },
      { name: "_vaultAddresses", type: "address[]" },
      { name: "_vaultTypes", type: "uint8[]" },
    ],
  },
] as const;

// Standard ERC-20 reads — safe to hand-write, no struct decoding involved.
export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
