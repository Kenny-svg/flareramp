import { getAddress, zeroAddress, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  ContractResolutionError,
  FLARE_CONTRACTS_REGISTRY,
  resolveContractAddress,
  resolveFxrpContracts,
} from "./flareContracts";

const ASSET_MANAGER = getAddress("0x1111111111111111111111111111111111111111");
const FXRP_TOKEN = getAddress("0x2222222222222222222222222222222222222222");

function mockClient(results: readonly unknown[]) {
  const readContract = vi.fn();
  for (const result of results) {
    readContract.mockResolvedValueOnce(result);
  }
  return {
    client: { readContract } as unknown as PublicClient,
    readContract,
  };
}

describe("Flare contract resolution", () => {
  it("resolves a named contract through the stable registry", async () => {
    const { client, readContract } = mockClient([ASSET_MANAGER]);

    await expect(
      resolveContractAddress(client, "AssetManagerFXRP"),
    ).resolves.toBe(ASSET_MANAGER);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: FLARE_CONTRACTS_REGISTRY,
        functionName: "getContractAddressByName",
        args: ["AssetManagerFXRP"],
      }),
    );
  });

  it("fails when the registry returns the zero address", async () => {
    const { client } = mockClient([zeroAddress]);

    await expect(
      resolveContractAddress(client, "AssetManagerFXRP"),
    ).rejects.toEqual(new ContractResolutionError("AssetManagerFXRP"));
  });

  it("resolves both the FXRP AssetManager and token", async () => {
    const { client, readContract } = mockClient([ASSET_MANAGER, FXRP_TOKEN]);

    await expect(resolveFxrpContracts(client)).resolves.toEqual({
      assetManager: ASSET_MANAGER,
      fAsset: FXRP_TOKEN,
    });
    expect(readContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        address: ASSET_MANAGER,
        functionName: "fAsset",
      }),
    );
  });

  it("fails when AssetManager returns no FXRP token", async () => {
    const { client } = mockClient([ASSET_MANAGER, zeroAddress]);

    await expect(resolveFxrpContracts(client)).rejects.toEqual(
      new ContractResolutionError("FXRP token"),
    );
  });
});
