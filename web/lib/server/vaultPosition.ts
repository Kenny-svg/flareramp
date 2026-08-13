import "server-only";

import { formatUnits, type Address } from "viem";
import { ERC20_ABI, getPublicClient } from "../contracts";
import { FIRELIGHT_VAULT_ABI, UPSHIFT_VAULT_ABI } from "../vaultContracts";
import { COSTON2_VAULT_DEPLOYMENTS, type VaultDeployment } from "../vaultDeployments";
import { readStableUint256 } from "./stableRead";

export interface VaultPosition {
  protocol: "Firelight" | "Upshift";
  vaultAddress: Address;
  userAddress: Address;
  assetSymbol: string;
  assetBalance: string;
  assetAllowanceToVault: string;
  shareSymbol: string;
  shareBalance: string;
  shareAllowanceToVault: string;
  checkedAt: string;
  /** True if a repeated balance read disagreed within the retry budget — see
   *  stableRead.ts. Applies to assetBalance and/or shareBalance. */
  unstable?: boolean;
}

function findDeployment(vaultAddress: string): VaultDeployment {
  const deployment = COSTON2_VAULT_DEPLOYMENTS.find(
    (d) => d.vaultAddress.toLowerCase() === vaultAddress.toLowerCase(),
  );
  if (!deployment) throw new Error(`Unknown vault address: ${vaultAddress}`);
  return deployment;
}

/**
 * Reads one user's balances and allowances against a single vault.
 * Both registered Coston2 vaults are ERC-4626-style: the vault contract
 * itself is the share token.
 */
export async function getVaultPosition(
  vaultAddressInput: string,
  userAddressInput: string,
): Promise<VaultPosition> {
  const vaultAddress = vaultAddressInput as Address;
  const userAddress = userAddressInput as Address;
  const deployment = findDeployment(vaultAddress);
  const client = getPublicClient("coston2");
  const abi =
    deployment.protocol === "Firelight" ? FIRELIGHT_VAULT_ABI : UPSHIFT_VAULT_ABI;

  const assetAddress = await client.readContract({
    address: vaultAddress,
    abi,
    functionName: "asset",
  });
  const shareTokenAddress = vaultAddress;

  const [assetSymbol, assetDecimals, assetBalanceRead, assetAllowance] =
    await Promise.all([
      client.readContract({
        address: assetAddress,
        abi: ERC20_ABI,
        functionName: "symbol",
      }),
      client.readContract({
        address: assetAddress,
        abi: ERC20_ABI,
        functionName: "decimals",
      }),
      readStableUint256(() =>
        client.readContract({
          address: assetAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [userAddress],
        }),
      ),
      client.readContract({
        address: assetAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [userAddress, vaultAddress],
      }),
    ]);

  const [shareSymbol, shareDecimals, shareBalanceRead, shareAllowance] =
    await Promise.all([
      client.readContract({
        address: shareTokenAddress,
        abi: ERC20_ABI,
        functionName: "symbol",
      }),
      client.readContract({
        address: shareTokenAddress,
        abi: ERC20_ABI,
        functionName: "decimals",
      }),
      readStableUint256(() =>
        client.readContract({
          address: shareTokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [userAddress],
        }),
      ),
      client.readContract({
        address: shareTokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [userAddress, vaultAddress],
      }),
    ]);

  return {
    protocol: deployment.protocol,
    vaultAddress,
    userAddress,
    assetSymbol,
    assetBalance: formatUnits(assetBalanceRead.value, assetDecimals),
    assetAllowanceToVault: formatUnits(assetAllowance, assetDecimals),
    shareSymbol,
    shareBalance: formatUnits(shareBalanceRead.value, shareDecimals),
    shareAllowanceToVault: formatUnits(shareAllowance, shareDecimals),
    checkedAt: new Date().toISOString(),
    unstable: !assetBalanceRead.stable || !shareBalanceRead.stable,
  };
}
