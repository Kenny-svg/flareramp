import { describe, expect, it } from "vitest";
import {
  VAULT_DEPOSIT_HEADROOM_BIPS,
  resolveShareReceiver,
} from "./mintFlow";

const PERSONAL_ACCOUNT = "0x16c3C6fDb329098C05bc75324976f22a826F63D3" as const;
const EXTERNAL_WALLET = "0x9E63a5D282F2fBb7DcE822B98e363b2719D28319" as const;

describe("resolveShareReceiver", () => {
  it("defaults to the Personal Account when unset, blank or whitespace", () => {
    for (const input of [undefined, "", "   "]) {
      expect(resolveShareReceiver(input, PERSONAL_ACCOUNT)).toBe(
        PERSONAL_ACCOUNT,
      );
    }
  });

  it("accepts and normalises an explicit address", () => {
    expect(
      resolveShareReceiver(EXTERNAL_WALLET.toLowerCase(), PERSONAL_ACCOUNT),
    ).toBe(EXTERNAL_WALLET);
    expect(
      resolveShareReceiver(` ${EXTERNAL_WALLET} `, PERSONAL_ACCOUNT),
    ).toBe(EXTERNAL_WALLET);
  });

  it("rejects malformed input rather than defaulting", () => {
    // Silently falling back to the Personal Account would send shares
    // somewhere the user did not intend, so these must throw.
    for (const bad of ["0x", "not-an-address", `${EXTERNAL_WALLET}00`]) {
      expect(() => resolveShareReceiver(bad, PERSONAL_ACCOUNT)).toThrow(
        /valid Coston2 address|checksum/i,
      );
    }
  });

  it("rejects a mixed-case address whose checksum does not verify", () => {
    // The realistic failure mode: one character of a copied address is wrong.
    // viem's getAddress would silently re-checksum this into a *different
    // valid address*, sending shares somewhere unrecoverable, so the checksum
    // has to be enforced explicitly.
    const mistyped = "0x9E63a5D282F2fBb7DcE822B98e363b2719D28318";
    expect(() => resolveShareReceiver(mistyped, PERSONAL_ACCOUNT)).toThrow(
      /checksum/i,
    );
  });

  it("accepts an all-lowercase address, which carries no checksum", () => {
    expect(
      resolveShareReceiver(
        "0x9e63a5d282f2fbb7dce822b98e363b2719d28318",
        PERSONAL_ACCOUNT,
      ),
    ).toBe("0x9E63a5D282f2FbB7Dce822b98E363b2719D28318");
  });

  it("rejects the zero address", () => {
    expect(() =>
      resolveShareReceiver(
        "0x0000000000000000000000000000000000000000",
        PERSONAL_ACCOUNT,
      ),
    ).toThrow(/zero address/i);
  });
});

describe("vault deposit headroom", () => {
  it("leaves the deposit strictly under the predicted mint", () => {
    const expected = 1_000_000n;
    const deposit =
      expected - (expected * VAULT_DEPOSIT_HEADROOM_BIPS) / 10_000n;
    expect(deposit).toBeLessThan(expected);
    // Headroom must stay small enough that the stranded dust is negligible.
    expect(expected - deposit).toBe(2_500n);
  });
});
