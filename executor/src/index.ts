import * as dotenv from "dotenv";
import { dirname, join } from "node:path";
import { keccak256, type Hex } from "viem";
import { runReconnectingXrplWatcher } from "./xrplWatcher";
import {
  createFdcProofDependencies,
  requestPaymentProof,
} from "./fdcProof";
import { parseExecutorConfig, parseFdcConfig } from "./config";
import {
  createDirectMintingDependencies,
  executeDirectMinting,
  getExecutorClients,
  recoverSubmittedDirectMinting,
} from "./flareExecutor";
import { JsonFileTransactionStore } from "./transactionStore";
import { TransactionProcessor } from "./transactionProcessor";
import { createLogger } from "./logger";
import { startHealthServer } from "./healthServer";
import { JsonFileUserOpStore } from "./userOpStore";

dotenv.config();

async function main() {
  const logger = createLogger();
  const config = parseExecutorConfig();
  const fdcConfig = parseFdcConfig();
  const { account } = getExecutorClients(
    config.executorPrivateKey,
    config.coston2RpcUrl,
  );
  const runtimeFdcConfig = {
    ...fdcConfig,
    coston2RpcUrl: config.coston2RpcUrl,
    executorPrivateKey: config.executorPrivateKey,
  };
  const fdcDependencies = createFdcProofDependencies(runtimeFdcConfig);
  const directMintingDependencies = createDirectMintingDependencies(
    config.executorPrivateKey,
    config.coston2RpcUrl,
  );
  const store = new JsonFileTransactionStore(config.transactionStorePath);
  const userOpStore = new JsonFileUserOpStore(
    join(dirname(config.transactionStorePath), "executor-userops.json"),
  );
  const health = { storeReady: false, watcherConnected: false };
  await store.initialize();
  await userOpStore.initialize();
  health.storeReady = true;

  const processor = new TransactionProcessor(
    store,
    {
      requestProof: (expected, lifecycle, resume) =>
        requestPaymentProof(
          expected,
          runtimeFdcConfig,
          fdcDependencies,
          lifecycle,
          resume,
        ),
      executeMinting: (proof, expectedPayment, onSubmitted, userOpData) =>
        executeDirectMinting(
          {
            proof,
            expectedPayment,
            executorPrivateKey: config.executorPrivateKey,
            coston2RpcUrl: config.coston2RpcUrl,
            userOpData,
            onSubmitted,
          },
          directMintingDependencies,
        ),
      recoverMinting: (submission, proof) =>
        recoverSubmittedDirectMinting(
          submission,
          proof,
          config.executorPrivateKey,
          config.coston2RpcUrl,
          directMintingDependencies,
        ),
      resolveUserOp: async (instruction) => {
        const memo = instruction.memoHex.toLowerCase();
        if (!memo.startsWith("0xfe") || memo.length !== 86) {
          return undefined;
        }
        const byHash = await userOpStore.get(keccak256(memo as Hex));
        if (byHash) return byHash.userOpData;
        const bySource = await userOpStore.getBySource(
          instruction.sourceXrplAddress,
        );
        return bySource?.userOpData;
      },
      now: () => Date.now(),
    },
    logger,
    {
      proofOwner: account.address,
      maxAttempts: config.maxJobAttempts,
      retryBaseDelayMs: config.jobRetryBaseDelayMs,
    },
  );

  const healthServer = await startHealthServer(
    config.healthPort,
    () => health,
    (transactionId) => store.get(transactionId),
    async () => {
      const jobs = await store.list();
      return {
        jobs_total: jobs.length,
        jobs_pending: jobs.filter(
          (job) =>
            !["minted", "failed", "recovery_required"].includes(job.stage),
        ).length,
        mints_succeeded_total: jobs.filter((job) => job.stage === "minted")
          .length,
        jobs_failed_total: jobs.filter(
          (job) =>
            job.stage === "failed" || job.stage === "recovery_required",
        ).length,
      };
    },
    (entry) => userOpStore.put(entry),
  );
  const abortController = new AbortController();
  const retryTimer = setInterval(
    () =>
      void processor.resumePending().catch((error) => {
        logger.error("resume_pending_failed", { error });
      }),
    Math.min(config.jobRetryBaseDelayMs, 5_000),
  );
  const shutdown = () => {
    abortController.abort();
    clearInterval(retryTimer);
    healthServer.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  logger.info("executor_started", {
    executorAddress: account.address,
    watchedXrplAddress: config.watchedXrplAddress,
    healthPort: config.healthPort,
  });
  void processor.resumePending().catch((error) => {
    logger.error("startup_recovery_failed", { error });
  });
  await runReconnectingXrplWatcher(
    config.xrplWssUrl,
    config.watchedXrplAddress,
    (instruction) => processor.observe(instruction).then(() => undefined),
    {
      signal: abortController.signal,
      onConnectionChange: (connected) => {
        health.watcherConnected = connected;
        logger.info("xrpl_connection_changed", { connected });
      },
      onError: (error) => {
        logger.error("xrpl_watcher_error", { error });
      },
    },
  );
}

main().catch((err) => {
  createLogger().error("executor_fatal", { error: err });
  process.exitCode = 1;
});
