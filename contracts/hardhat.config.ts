import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config();

function configuredAccounts(): string[] {
  const privateKey = process.env.PRIVATE_KEY?.trim();
  if (!privateKey) {
    return [];
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey) || /^0x0{64}$/i.test(privateKey)) {
    throw new Error(
      "PRIVATE_KEY must be a non-zero 32-byte 0x-prefixed hexadecimal value",
    );
  }
  return [privateKey];
}

const accounts = configuredAccounts();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      // Required when interacting with Flare periphery contracts.
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    coston2: {
      url: process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc",
      chainId: 114,
      accounts,
    },
    flare: {
      url: process.env.FLARE_RPC_URL ?? "https://flare-api.flare.network/ext/C/rpc",
      chainId: 14,
      accounts,
    },
  },
};

export default config;
