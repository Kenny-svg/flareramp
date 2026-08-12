import { describe, expect, it } from "vitest";
import {
  buildFeCustomInstructionMemo,
  buildPackedUserOperation,
  encodePackedUserOperation,
  hashPackedUserOperation,
} from "./customInstruction";

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
