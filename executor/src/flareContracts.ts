import {
  iAssetManagerAbi,
  iFlareContractRegistryAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  isAddressEqual,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import { DEFAULT_COSTON2_RPC_URL } from "./config";

export const FLARE_CONTRACTS_REGISTRY: Address =
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

export const coston2 = defineChain({
  id: 114,
  name: "Coston2",
  nativeCurrency: {
    name: "Coston2 Flare",
    symbol: "C2FLR",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [DEFAULT_COSTON2_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Coston2 Explorer",
      url: "https://coston2-explorer.flare.network",
    },
  },
  testnet: true,
});

export class ContractResolutionError extends Error {
  constructor(contractName: string) {
    super(`Flare contract registry returned no address for ${contractName}`);
    this.name = "ContractResolutionError";
  }
}

export function createCoston2PublicClient(rpcUrl = DEFAULT_COSTON2_RPC_URL) {
  return createPublicClient({
    chain: coston2,
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }),
  });
}

export async function resolveContractAddress(
  client: PublicClient,
  contractName: string,
): Promise<Address> {
  const address = await client.readContract({
    address: FLARE_CONTRACTS_REGISTRY,
    abi: iFlareContractRegistryAbi,
    functionName: "getContractAddressByName",
    args: [contractName],
  });

  if (isAddressEqual(address, zeroAddress)) {
    throw new ContractResolutionError(contractName);
  }
  return getAddress(address);
}

export interface FxrpContracts {
  assetManager: Address;
  fAsset: Address;
}

export async function resolveFxrpContracts(
  client: PublicClient,
): Promise<FxrpContracts> {
  const assetManager = await resolveContractAddress(client, "AssetManagerFXRP");
  const fAsset = await client.readContract({
    address: assetManager,
    abi: iAssetManagerAbi,
    functionName: "fAsset",
  });

  if (isAddressEqual(fAsset, zeroAddress)) {
    throw new ContractResolutionError("FXRP token");
  }

  return {
    assetManager,
    fAsset: getAddress(fAsset),
  };
}
