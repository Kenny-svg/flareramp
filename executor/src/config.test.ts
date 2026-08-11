import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  DEFAULT_COSTON2_RPC_URL,
  DEFAULT_XRPL_WSS_URL,
  parseExecutorConfig,
  parseFdcConfig,
} from "./config";

const VALID_PRIVATE_KEY = `0x${"1".repeat(64)}`;
const VALID_XRPL_ADDRESS = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";

function validEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    EXECUTOR_PRIVATE_KEY: VALID_PRIVATE_KEY,
    WATCHED_XRPL_ADDRESS: VALID_XRPL_ADDRESS,
    ...overrides,
  };
}

describe("parseExecutorConfig", () => {
  it("loads valid configuration with official testnet defaults", () => {
    const config = parseExecutorConfig(validEnv());

    expect(config).toEqual({
      coston2RpcUrl: DEFAULT_COSTON2_RPC_URL,
      executorPrivateKey: VALID_PRIVATE_KEY,
      healthPort: 3001,
      maxJobAttempts: 5,
      jobRetryBaseDelayMs: 5000,
      transactionStorePath: "./data/executor-jobs.json",
      watchedXrplAddress: VALID_XRPL_ADDRESS,
      xrplWssUrl: DEFAULT_XRPL_WSS_URL,
    });
  });

  it("fails closed when the executor key is missing", () => {
    expect(() =>
      parseExecutorConfig({
        WATCHED_XRPL_ADDRESS: VALID_XRPL_ADDRESS,
      }),
    ).toThrow(new ConfigurationError("EXECUTOR_PRIVATE_KEY is required"));
  });

  it("rejects malformed private keys", () => {
    expect(() =>
      parseExecutorConfig(validEnv({ EXECUTOR_PRIVATE_KEY: "0x1234" })),
    ).toThrow(/32-byte/);
  });

  it("rejects the zero private key", () => {
    expect(() =>
      parseExecutorConfig({
        ...validEnv(),
        EXECUTOR_PRIVATE_KEY: `0x${"0".repeat(64)}`,
      }),
    ).toThrow(/zero key/);
  });

  it("rejects invalid XRPL addresses", () => {
    expect(() =>
      parseExecutorConfig(
        validEnv({ WATCHED_XRPL_ADDRESS: "not-an-xrpl-address" }),
      ),
    ).toThrow(/valid XRPL classic address/);
  });

  it("rejects RPC URLs with non-HTTP protocols", () => {
    expect(() =>
      parseExecutorConfig(validEnv({ COSTON2_RPC_URL: "file:///tmp/rpc" })),
    ).toThrow(/must use http or https/);
  });
});

describe("parseFdcConfig", () => {
  it("loads authenticated verifier and DA Layer settings", () => {
    expect(
      parseFdcConfig({
        VERIFIER_API_KEY_TESTNET: "verifier-key",
        COSTON2_DA_LAYER_URL: "https://da.example",
        COSTON2_DA_LAYER_API_KEY: "da-key",
      }),
    ).toEqual({
      verifierUrl: "https://fdc-verifiers-testnet.flare.network",
      verifierApiKey: "verifier-key",
      daLayerUrl: "https://da.example",
      daLayerApiKey: "da-key",
      prepareTimeoutMs: 60_000,
      finalizationTimeoutMs: 300_000,
      proofTimeoutMs: 120_000,
    });
  });

  it("requires verifier credentials and the DA Layer endpoint", () => {
    expect(() => parseFdcConfig({})).toThrow(
      new ConfigurationError("VERIFIER_API_KEY_TESTNET is required"),
    );
    expect(() =>
      parseFdcConfig({ VERIFIER_API_KEY_TESTNET: "key" }),
    ).toThrow(new ConfigurationError("COSTON2_DA_LAYER_URL is required"));
  });

  it("rejects invalid FDC timeout configuration", () => {
    expect(() =>
      parseFdcConfig({
        VERIFIER_API_KEY_TESTNET: "key",
        COSTON2_DA_LAYER_URL: "https://da.example",
        FDC_PROOF_TIMEOUT_MS: "0",
      }),
    ).toThrow(/FDC_PROOF_TIMEOUT_MS must be a positive integer/);
  });
});
