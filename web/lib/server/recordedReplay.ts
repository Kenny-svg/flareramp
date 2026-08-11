import "server-only";

import fixture from "flareramp-executor/proof-receipt-fixture";

export interface RecordedReplay {
  mode: "recorded_public_transaction";
  label: "Recorded demo — not a live mint";
  capturedAt: string;
  network: string;
  xrpl: {
    transactionHash: string;
    ledgerIndex: number;
    amountDrops: string;
    explorerUrl: string;
  };
  fdc: {
    votingRoundId: string;
    merkleProofStatus: "recorded_available";
  };
  flare: {
    transactionHash: string;
    blockNumber: string;
    explorerUrl: string;
  };
  fxrp: {
    recipient: string;
    receivedUBA: string;
    mintingFeeUBA: string;
    executorFeeUBA: string;
  };
}

export function getRecordedReplay(): RecordedReplay {
  if (process.env.DEMO_REPLAY_ENABLED !== "true") {
    throw new Error("Recorded replay is disabled");
  }
  return {
    mode: "recorded_public_transaction",
    label: "Recorded demo — not a live mint",
    capturedAt: fixture.completedAt,
    network: fixture.network,
    xrpl: {
      transactionHash: fixture.xrpl.transactionId,
      ledgerIndex: fixture.xrpl.ledgerIndex,
      amountDrops: fixture.xrpl.amountDrops,
      explorerUrl:
        `https://testnet.xrpl.org/transactions/${fixture.xrpl.transactionId}`,
    },
    fdc: {
      votingRoundId: fixture.fdc.votingRound,
      merkleProofStatus: "recorded_available",
    },
    flare: {
      transactionHash: fixture.settlement.flareTransactionHash,
      blockNumber: fixture.settlement.blockNumber,
      explorerUrl:
        `https://coston2-explorer.flare.network/tx/${fixture.settlement.flareTransactionHash}`,
    },
    fxrp: {
      recipient: fixture.fxrp.recipient,
      receivedUBA: fixture.fxrp.balanceDeltaUBA,
      mintingFeeUBA: fixture.settlement.mintingFeeUBA,
      executorFeeUBA: fixture.settlement.executorFeeUBA,
    },
  };
}
