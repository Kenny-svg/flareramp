import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";

describe("structured logger", () => {
  it("redacts secrets recursively", () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));

    logger.info("configured", {
      executorPrivateKey: "0xsecret",
      nested: {
        verifierApiKey: "secret-key",
        transactionId: "ABC",
      },
    });

    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry.executorPrivateKey).toBe("[REDACTED]");
    expect(entry.nested).toEqual({
      verifierApiKey: "[REDACTED]",
      transactionId: "ABC",
    });
  });
});
