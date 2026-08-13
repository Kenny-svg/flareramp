import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address, Hex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DirectMintingSettlement } from "./flareExecutor";
import type { XrpPaymentProof } from "./fdcProof";
import type { StructuredLogger } from "./logger";
import {
  JsonFileTransactionStore,
  MemoryTransactionStore,
  type TransactionJob,
} from "./transactionStore";
import {
  TransactionProcessor,
  type TransactionProcessorDependencies,
} from "./transactionProcessor";
import type { IncomingInstruction } from "./xrplWatcher";

const PROOF_OWNER = "0x1111111111111111111111111111111111111111";
const ASSET_MANAGER = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x3333333333333333333333333333333333333333";
const XRPL_TRANSACTION_ID = `0x${"ab".repeat(32)}` as Hex;
const FLARE_TRANSACTION_HASH = `0x${"cd".repeat(32)}` as Hex;
const JOB_ID = XRPL_TRANSACTION_ID.slice(2).toUpperCase();

const instruction: IncomingInstruction = {
  txHash: XRPL_TRANSACTION_ID,
  sourceXrplAddress: "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY",
  destinationXrplAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  amountDrops: 1_000_000n,
  memoHex: "0x1234",
  destinationTag: null,
};

const proof = {
  merkleProof: [],
  data: {
    votingRound: 42n,
    requestBody: {
      transactionId: XRPL_TRANSACTION_ID,
      proofOwner: PROOF_OWNER,
    },
  },
} as unknown as XrpPaymentProof;

const settlement: DirectMintingSettlement = {
  status: "executed",
  assetManager: ASSET_MANAGER,
  flareTransactionHash: FLARE_TRANSACTION_HASH,
  blockNumber: 100n,
  blockHash: `0x${"ef".repeat(32)}`,
  xrplTransactionId: XRPL_TRANSACTION_ID,
  recipient: RECIPIENT,
  executor: PROOF_OWNER,
  mintedAmountUBA: 800_000n,
  mintingFeeUBA: 100_000n,
  executorFeeUBA: 100_000n,
  gasUsed: 90_000n,
  effectiveGasPrice: 25n,
};

function logger(): StructuredLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function dependencies(
  overrides: Partial<TransactionProcessorDependencies> = {},
): TransactionProcessorDependencies {
  return {
    requestProof: vi.fn().mockResolvedValue(proof),
    executeMinting: vi.fn().mockResolvedValue(settlement),
    recoverMinting: vi.fn().mockResolvedValue(settlement),
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("TransactionProcessor persistence and idempotency", () => {
  it("stores duplicate XRPL events as one transaction job", async () => {
    const store = new MemoryTransactionStore();
    await store.initialize();
    const deps = dependencies();
    const processor = new TransactionProcessor(store, deps, logger(), {
      proofOwner: PROOF_OWNER,
      autoProcessObserved: false,
    });

    const first = await processor.observe(instruction);
    const duplicate = await processor.observe(instruction);

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(await store.list()).toHaveLength(1);
    expect(deps.requestProof).not.toHaveBeenCalled();
  });

  it("recovers a submitted execution after a process restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flareramp-store-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "jobs.json");
    const firstStore = new JsonFileTransactionStore(filePath);
    await firstStore.initialize();
    const crashedJob: TransactionJob = {
      id: JOB_ID,
      stage: "execution_submitted",
      instruction,
      attempts: 0,
      nextAttemptAt: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      proof,
      execution: {
        transactionHash: FLARE_TRANSACTION_HASH,
        assetManager: ASSET_MANAGER,
      },
    };
    await firstStore.createIfAbsent(crashedJob);

    const restartedStore = new JsonFileTransactionStore(filePath);
    await restartedStore.initialize();
    const deps = dependencies();
    const restartedProcessor = new TransactionProcessor(
      restartedStore,
      deps,
      logger(),
      { proofOwner: PROOF_OWNER, autoProcessObserved: false },
    );

    await restartedProcessor.resumePending();

    const recovered = await restartedStore.get(JOB_ID);
    expect(recovered?.stage).toBe("minted");
    expect(
      recovered?.settlement?.status === "executed"
        ? recovered.settlement.mintedAmountUBA
        : undefined,
    ).toBe(800_000n);
    expect(deps.recoverMinting).toHaveBeenCalledWith(
      {
        transactionHash: FLARE_TRANSACTION_HASH,
        assetManager: ASSET_MANAGER,
      },
      expect.objectContaining({
        data: expect.objectContaining({
          requestBody: expect.objectContaining({
            transactionId: XRPL_TRANSACTION_ID,
          }),
        }),
      }),
    );
    expect(deps.executeMinting).not.toHaveBeenCalled();
  });

  it("checkpoints every proof and execution stage before minting", async () => {
    const store = new MemoryTransactionStore();
    await store.initialize();
    const stages: string[] = [];
    const deps = dependencies({
      requestProof: vi.fn(
        async (_expected, lifecycle): Promise<XrpPaymentProof> => {
          await lifecycle.onPrepared?.("0x1234");
          await lifecycle.onAttestationRequested?.(
            {
              transactionHash: `0x${"12".repeat(32)}`,
              votingRoundId: 42n,
            },
            "0x1234",
          );
          await lifecycle.onFinalized?.(42n);
          await lifecycle.onProofFetched?.(proof);
          return proof;
        },
      ),
      executeMinting: vi.fn(
        async (_proof, _expected, onSubmitted) => {
          await onSubmitted(FLARE_TRANSACTION_HASH, ASSET_MANAGER);
          return settlement;
        },
      ),
    });
    const testLogger = logger();
    (testLogger.info as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, fields?: Record<string, unknown>) => {
        if (event === "transaction_stage_changed") {
          stages.push(String(fields?.stage));
        }
      },
    );
    const processor = new TransactionProcessor(
      store,
      deps,
      testLogger,
      { proofOwner: PROOF_OWNER, autoProcessObserved: false },
    );
    await processor.observe(instruction);

    await processor.resumePending();

    expect(stages).toEqual([
      "confirming",
      "confirming",
      "attestation_requested",
      "finalized",
      "proof_fetched",
      "execution_submitted",
      "minted",
    ]);
  });
});
