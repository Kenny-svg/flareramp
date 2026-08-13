import { describe, expect, it } from "vitest";
import { keccak256, stringToHex, toHex } from "viem";
import {
  decodePaymentResponse,
  validatePaymentProof,
  type ExpectedInstructionPayment,
  type PaymentProof,
} from "./fdcPaymentProof";
import { FdcProofError } from "./fdcProof";

const MEMO =
  "0x0200000000000000000000000001000000000000000000000000000000000000" as const;
const SOURCE = "raCLYHD5V22bo11FG229M4WpxTBg7x956A";
const OPERATOR = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

function addressHash(address: string) {
  return keccak256(toHex(address));
}

describe("validatePaymentProof", () => {
  it("rejects memo mismatches", () => {
    const expected: ExpectedInstructionPayment = {
      transactionId: `0x${"ab".repeat(32)}`,
      sourceAddress: SOURCE,
      destinationAddress: OPERATOR,
      amountDrops: 1_000_000n,
      memoData: MEMO,
    };
    const proof = {
      merkleProof: [],
      data: {
        attestationType: stringToHex("Payment", { size: 32 }),
        sourceId: stringToHex("testXRP", { size: 32 }),
        votingRound: 1n,
        lowestUsedTimestamp: 1n,
        requestBody: {
          transactionId: expected.transactionId,
          inUtxo: 0n,
          utxo: 0n,
        },
        responseBody: {
          blockNumber: 1n,
          blockTimestamp: 1n,
          sourceAddressHash: addressHash(SOURCE),
          sourceAddressesRoot: `0x${"00".repeat(32)}`,
          receivingAddressHash: addressHash(OPERATOR),
          intendedReceivingAddressHash: addressHash(OPERATOR),
          spentAmount: 1_000_000n,
          intendedSpentAmount: 1_000_000n,
          receivedAmount: 1_000_000n,
          intendedReceivedAmount: 1_000_000n,
          standardPaymentReference: `0x${"cd".repeat(32)}`,
          oneToOne: true,
          status: 0,
        },
      },
    } as PaymentProof;

    expect(() => validatePaymentProof(proof, expected, 1n)).toThrow(
      FdcProofError,
    );
  });
});

describe("decodePaymentResponse", () => {
  it("throws on garbage hex", () => {
    expect(() => decodePaymentResponse("0x1234")).toThrow(FdcProofError);
  });
});
