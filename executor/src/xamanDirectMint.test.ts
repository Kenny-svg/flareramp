import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  buildDirectMintingMemo,
  createXamanDirectMintService,
  type DirectMintPaymentTemplate,
  type XamanDirectMintDependencies,
} from "./xamanDirectMint";

const SOURCE = "rSource1111111111111111111111111";
const VAULT = "rVault11111111111111111111111111";
const RECIPIENT = getAddress(
  "0x1111111111111111111111111111111111111111",
);
const EXECUTOR = getAddress(
  "0x2222222222222222222222222222222222222222",
);

function template(): DirectMintPaymentTemplate {
  return {
    sourceAddress: SOURCE,
    coreVaultAddress: VAULT,
    amountDrops: "1000000",
    recipient: RECIPIENT,
    executorAddress: EXECUTOR,
    memoData: buildDirectMintingMemo(RECIPIENT, EXECUTOR),
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  const expected = template();
  return {
    meta: {
      exists: true,
      resolved: false,
      signed: false,
      cancelled: false,
      expired: false,
    },
    payload: {
      request_json: {
        TransactionType: "Payment",
        Account: SOURCE,
        Destination: VAULT,
        Amount: "1000000",
        Memos: [
          {
            Memo: {
              MemoData: expected.memoData.slice(2),
            },
          },
        ],
      },
    },
    response: {
      txid: null,
      account: null,
    },
    ...overrides,
  };
}

function dependencies(
  getResult = payload(),
): XamanDirectMintDependencies {
  return {
    payload: {
      create: vi.fn(async () => ({
        uuid: "payload-1",
        next: { always: "https://xumm.app/sign/payload-1" },
        refs: { qr_png: "https://xumm.app/sign/payload-1_q.png" },
      })),
      get: vi.fn(async () => getResult),
      cancel: vi.fn(async () => ({
        result: { cancelled: true, reason: "OK" },
      })),
    },
    validateSubmittedPayment: vi.fn(async () => "validated" as const),
  };
}

describe("buildDirectMintingMemo", () => {
  it("builds official recipient-only and preferred-executor formats", () => {
    expect(buildDirectMintingMemo(RECIPIENT)).toBe(
      `0x464250526641001800000000${RECIPIENT.slice(2).toLowerCase()}`,
    );
    expect(buildDirectMintingMemo(RECIPIENT, EXECUTOR)).toBe(
      `0x4642505266410021${RECIPIENT.slice(2).toLowerCase()}${EXECUTOR.slice(2).toLowerCase()}`,
    );
  });
});

describe("Xaman direct mint service", () => {
  it("creates an immutable reviewable Core Vault payment", async () => {
    const deps = dependencies();
    const service = createXamanDirectMintService(deps);

    await expect(service.create(template())).resolves.toEqual({
      payloadId: "payload-1",
      deepLink: "https://xumm.app/sign/payload-1",
      qrCode: "https://xumm.app/sign/payload-1_q.png",
    });
    expect(deps.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        txjson: expect.objectContaining({
          Account: SOURCE,
          Destination: VAULT,
          Amount: "1000000",
        }),
        options: expect.objectContaining({
          submit: true,
          force_network: "TESTNET",
        }),
      }),
    );
  });

  it.each([
    [
      "awaiting",
      payload(),
    ],
    [
      "cancelled",
      payload({
        meta: {
          exists: true,
          resolved: true,
          signed: false,
          cancelled: true,
          expired: false,
        },
      }),
    ],
    [
      "expired",
      payload({
        meta: {
          exists: true,
          resolved: false,
          signed: false,
          cancelled: false,
          expired: true,
        },
      }),
    ],
    [
      "rejected",
      payload({
        meta: {
          exists: true,
          resolved: true,
          signed: false,
          cancelled: false,
          expired: false,
        },
      }),
    ],
  ])("maps Xaman state to %s", async (stage, response) => {
    const status = await createXamanDirectMintService(
      dependencies(response),
    ).status("payload-1");
    expect(status.stage).toBe(stage);
  });

  it("validates the signed submitted transaction", async () => {
    const deps = dependencies(
      payload({
        meta: {
          exists: true,
          resolved: true,
          signed: true,
          cancelled: false,
          expired: false,
        },
        response: {
          txid: "A".repeat(64),
          account: SOURCE,
        },
      }),
    );
    const status = await createXamanDirectMintService(deps).status(
      "payload-1",
    );

    expect(status).toMatchObject({
      stage: "signed",
      transactionId: "A".repeat(64),
      signer: SOURCE,
    });
    expect(deps.validateSubmittedPayment).toHaveBeenCalledWith(
      "A".repeat(64),
      template(),
    );
  });

  it("rejects malformed signed responses and signer mismatches", async () => {
    const missingTransaction = await createXamanDirectMintService(
      dependencies(
        payload({
          meta: {
            exists: true,
            resolved: true,
            signed: true,
            cancelled: false,
            expired: false,
          },
        }),
      ),
    ).status("payload-1");
    expect(missingTransaction.stage).toBe("malformed");

    const wrongSigner = await createXamanDirectMintService(
      dependencies(
        payload({
          meta: {
            exists: true,
            resolved: true,
            signed: true,
            cancelled: false,
            expired: false,
          },
          response: {
            txid: "B".repeat(64),
            account: "rDifferentSigner",
          },
        }),
      ),
    ).status("payload-1");
    expect(wrongSigner).toMatchObject({
      stage: "malformed",
      message: "Payment was signed by a different XRPL account",
    });
  });

  it("cancels an unresolved request", async () => {
    await expect(
      createXamanDirectMintService(dependencies()).cancel("payload-1"),
    ).resolves.toMatchObject({
      stage: "cancelled",
      payloadId: "payload-1",
    });
  });
});
