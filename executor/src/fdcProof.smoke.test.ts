import { getAddress, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TESTNET_VERIFIER_URL,
  createFdcProofDependencies,
} from "./fdcProof";

const enabled = process.env.RUN_FDC_SMOKE_TEST === "true";

describe.skipIf(!enabled)("Coston2 XRPPayment verifier smoke test", () => {
  it(
    "prepares an existing XRPL testnet payment without signing",
    async () => {
      const transactionId = process.env.FDC_SMOKE_XRPL_TX_ID;
      const proofOwner = process.env.FDC_SMOKE_PROOF_OWNER;
      const verifierApiKey = process.env.VERIFIER_API_KEY_TESTNET;
      if (!transactionId || !proofOwner || !verifierApiKey) {
        throw new Error(
          "FDC_SMOKE_XRPL_TX_ID, FDC_SMOKE_PROOF_OWNER, and VERIFIER_API_KEY_TESTNET are required",
        );
      }

      const dependencies = createFdcProofDependencies({
        coston2RpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
        // Used only to construct the client; this test never calls submitRequest.
        executorPrivateKey: `0x${"1".repeat(64)}` as Hex,
        verifierUrl:
          process.env.VERIFIER_URL_TESTNET ??
          DEFAULT_TESTNET_VERIFIER_URL,
        verifierApiKey,
        daLayerUrl: "https://unused.invalid",
      });

      const prepared = await dependencies.prepareRequest(
        {
          transactionId,
          proofOwner: getAddress(proofOwner),
          sourceAddress: "",
          destinationAddress: "",
          amountDrops: 1n,
          memoData: null,
          destinationTag: null,
        },
        AbortSignal.timeout(30_000),
      );

      expect(prepared.abiEncodedRequest).toMatch(/^0x[0-9a-f]+$/i);
    },
    35_000,
  );
});
