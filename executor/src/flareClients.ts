import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_COSTON2_RPC_URL } from "./config";
import { coston2 } from "./flareContracts";

export function getExecutorClients(
  privateKey: `0x${string}`,
  rpcUrl = DEFAULT_COSTON2_RPC_URL,
) {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: coston2,
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }),
  });
  const walletClient = createWalletClient({
    account,
    chain: coston2,
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }),
  });
  return { account, publicClient, walletClient };
}
