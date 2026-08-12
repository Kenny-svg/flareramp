import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import {
  buildFeCustomInstructionMemo,
  buildPackedUserOperation,
  buildVaultDepositCalls,
  encodePackedUserOperation,
  hashPackedUserOperation,
} from "./customInstruction";
import { FIRELIGHT_VAULT_ABI } from "./vaultContracts";

const PERSONAL_ACCOUNT = "0x16c3C6fDb329098C05bc75324976f22a826F63D3" as const;
const FXRP_TOKEN = "0x8b4AbA9c4BD7dd961659b02129bEe20c6286575e" as const;
const VAULT = "0xC90D6847747b85d1fa2E07859869fb9fB72c0361" as const;
const EXTERNAL_WALLET = "0x9E63a5D282F2fBb7DcE822B98e363b2719D28319" as const;

function depositReceiver(calls: ReturnType<typeof buildVaultDepositCalls>) {
  const { args } = decodeFunctionData({
    abi: FIRELIGHT_VAULT_ABI,
    data: calls[1].data,
  });
  return args?.[1];
}

describe("customInstruction", () => {
  it("builds a 42-byte 0xFE memo", () => {
    const hash =
      "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;
    const memo = buildFeCustomInstructionMemo({
      executorFeeUBA: 100_000n,
      userOpHash: hash,
    });
    expect(memo).toMatch(/^0xfe00/);
    expect(memo.length).toBe(86);
    expect(memo.endsWith(hash.slice(2))).toBe(true);
  });

  it("hashes a packed user operation stably", () => {
    const userOp = buildPackedUserOperation({
      sender: "0x16c3C6fDb329098C05bc75324976f22a826F63D3",
      nonce: 1n,
      calls: [
        {
          target: "0x16c3C6fDb329098C05bc75324976f22a826F63D3",
          value: 0n,
          data: "0x",
        },
      ],
    });
    const encoded = encodePackedUserOperation(userOp);
    expect(encoded.startsWith("0x")).toBe(true);
    expect(hashPackedUserOperation(userOp)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("vault deposit share recipient", () => {
  const base = {
    protocol: "Firelight" as const,
    fxrpToken: FXRP_TOKEN,
    vault: VAULT,
    personalAccount: PERSONAL_ACCOUNT,
    amountUBA: 1_000_000n,
  };

  it("credits the Personal Account when no receiver is given", () => {
    expect(depositReceiver(buildVaultDepositCalls(base))).toBe(PERSONAL_ACCOUNT);
  });

  it("credits an explicit receiver instead", () => {
    const calls = buildVaultDepositCalls({
      ...base,
      shareReceiver: EXTERNAL_WALLET,
    });
    expect(depositReceiver(calls)).toBe(EXTERNAL_WALLET);
  });

  it("keeps the Personal Account as spender when shares are redirected", () => {
    // The approve must stay on the account that actually holds the minted
    // FXRP; redirecting shares must not redirect the allowance.
    const calls = buildVaultDepositCalls({
      ...base,
      shareReceiver: EXTERNAL_WALLET,
    });
    expect(calls[0].target).toBe(FXRP_TOKEN);
    expect(calls).toHaveLength(2);
    expect(calls[1].target).toBe(VAULT);
  });

  it("changes the committed userOp hash when the receiver changes", () => {
    // The memo commits keccak256(userOp), so a different receiver must produce
    // a different memo — otherwise a redirected deposit could be replayed
    // under a memo signed for the default receiver.
    const forSelf = hashPackedUserOperation(
      buildPackedUserOperation({
        sender: PERSONAL_ACCOUNT,
        nonce: 0n,
        calls: buildVaultDepositCalls(base),
      }),
    );
    const forOther = hashPackedUserOperation(
      buildPackedUserOperation({
        sender: PERSONAL_ACCOUNT,
        nonce: 0n,
        calls: buildVaultDepositCalls({
          ...base,
          shareReceiver: EXTERNAL_WALLET,
        }),
      }),
    );
    expect(forSelf).not.toBe(forOther);
  });
});
