import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("web production configuration", () => {
  it("fails closed when server credentials are missing", async () => {
    vi.stubEnv("VERIFIER_API_KEY_TESTNET", "");
    vi.stubEnv("XAMAN_API_KEY", "");
    vi.stubEnv("XAMAN_API_SECRET", "");
    const { getWebServerConfig } = await import("./config");
    expect(() => getWebServerConfig()).toThrow(
      "VERIFIER_API_KEY_TESTNET is required",
    );
  });

  it("validates and returns server-only endpoints", async () => {
    vi.stubEnv("VERIFIER_API_KEY_TESTNET", "verifier");
    vi.stubEnv("XAMAN_API_KEY", "xaman-key");
    vi.stubEnv("XAMAN_API_SECRET", "xaman-secret");
    vi.stubEnv("EXECUTOR_STATUS_URL", "https://executor.internal");
    const { getWebServerConfig } = await import("./config");
    expect(getWebServerConfig()).toMatchObject({
      executorStatusUrl: "https://executor.internal",
      verifierApiKey: "verifier",
      xamanApiKey: "xaman-key",
      xamanApiSecret: "xaman-secret",
    });
  });
});
