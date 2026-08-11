import { afterEach, describe, expect, it } from "vitest";
import { getRecordedReplay } from "./recordedReplay";

const previous = process.env.DEMO_REPLAY_ENABLED;

afterEach(() => {
  process.env.DEMO_REPLAY_ENABLED = previous;
});

describe("recorded outage replay", () => {
  it("is disabled by default", () => {
    delete process.env.DEMO_REPLAY_ENABLED;
    expect(() => getRecordedReplay()).toThrow("Recorded replay is disabled");
  });

  it("returns only clearly labeled public evidence", () => {
    process.env.DEMO_REPLAY_ENABLED = "true";
    const replay = getRecordedReplay();

    expect(replay).toMatchObject({
      mode: "recorded_public_transaction",
      label: "Recorded demo — not a live mint",
      xrpl: {
        transactionHash:
          "0xae0e455c6f5a5da463dcd8af638d1903f56ae43beb1ad3bd7f4b9c409f142836",
      },
      flare: {
        transactionHash:
          "0xc907ce2db02a3ddd4c2c661fc0f8e712d45c2e66cdea1a0e52f4f667789cb327",
      },
      fxrp: { receivedUBA: "800000" },
    });
    expect(Object.keys(replay.fdc)).toEqual([
      "votingRoundId",
      "merkleProofStatus",
    ]);
    expect(JSON.stringify(replay)).not.toContain("privateKey");
  });
});
