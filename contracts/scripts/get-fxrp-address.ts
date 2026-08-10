/**
 * Resolves the FXRP AssetManager and FXRP token address at runtime via the
 * FlareContractsRegistry — never hardcode these, they differ per network.
 *
 * Usage: npx hardhat run scripts/get-fxrp-address.ts --network coston2
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Same address on every Flare network (Coston2, Songbird, Flare mainnet).
const FLARE_CONTRACTS_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

const REGISTRY_ABI = [
  "function getContractAddressByName(string calldata _name) external view returns (address)",
];

const ASSET_MANAGER_ABI = ["function fAsset() external view returns (address)"];

async function main() {
  const rpcUrl = process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const registry = new ethers.Contract(FLARE_CONTRACTS_REGISTRY, REGISTRY_ABI, provider);
  const assetManagerAddress: string = await registry.getContractAddressByName("AssetManagerFXRP");

  const assetManager = new ethers.Contract(assetManagerAddress, ASSET_MANAGER_ABI, provider);
  const fxrpAddress: string = await assetManager.fAsset();

  console.log("AssetManager (FXRP):", assetManagerAddress);
  console.log("FXRP token address:", fxrpAddress);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
