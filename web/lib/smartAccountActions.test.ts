import { describe, expect, it } from "vitest";
import {
  SMART_ACCOUNT_ACTION_IDS,
  actionLabel,
  vaultTypeForAction,
} from "./smartAccountActions";
import {
  decodeInstructionHeader,
  encodeFirelightClaimWithdraw,
  encodeFirelightRedeem,
  encodeFxrpRedeem,
  encodeUpshiftClaim,
} from "./smartAccountInstructions";

describe("smartAccountActions", () => {
  it("maps product actions to CRT opcodes", () => {
    expect(SMART_ACCOUNT_ACTION_IDS.redeem).toBe(0x02);
    expect(SMART_ACCOUNT_ACTION_IDS.firelightWithdraw).toBe(0x12);
    expect(SMART_ACCOUNT_ACTION_IDS.upshiftClaim).toBe(0x23);
    expect(vaultTypeForAction("firelightClaim")).toBe(1);
    expect(vaultTypeForAction("upshiftWithdraw")).toBe(2);
    expect(vaultTypeForAction("redeem")).toBeNull();
    expect(actionLabel("redeem")).toContain("Redeem");
  });

  it("encodes redeem lots and vault exit memos as 32 bytes", () => {
    const redeem = encodeFxrpRedeem({ lots: 1n });
    expect(redeem).toHaveLength(66);
    expect(decodeInstructionHeader(redeem).instructionId).toBe(0x02);
    expect(decodeInstructionHeader(redeem).value).toBe(1n);

    const withdraw = encodeFirelightRedeem({ amountFxrp: 10n, vaultId: 1 });
    expect(decodeInstructionHeader(withdraw).instructionId).toBe(0x12);
    expect(decodeInstructionHeader(withdraw).value).toBe(10n);

    // Firelight claim value is the vault period, not FXRP amount.
    const firelightClaim = encodeFirelightClaimWithdraw({
      period: 42n,
      vaultId: 1,
    });
    expect(decodeInstructionHeader(firelightClaim).instructionId).toBe(0x13);
    expect(decodeInstructionHeader(firelightClaim).value).toBe(42n);
    expect(firelightClaim).toBe(
      "0x13000000000000000000002a0000000100000000000000000000000000000000",
    );

    const claim = encodeUpshiftClaim({ date: 20251218, vaultId: 2 });
    expect(decodeInstructionHeader(claim).instructionId).toBe(0x23);
    expect(decodeInstructionHeader(claim).value).toBe(20251218n);
  });
});
