import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Address, Hex } from "viem";
import type { DirectMintingSettlement } from "./flareExecutor";
import type { XrpPaymentProof } from "./fdcProof";
import type { IncomingInstruction } from "./xrplWatcher";

export const TRANSACTION_STAGES = [
  "observed",
  "confirming",
  "attestation_requested",
  "finalized",
  "proof_fetched",
  "execution_submitted",
  "minted",
  "failed",
  "recovery_required",
] as const;

export type TransactionStage = (typeof TRANSACTION_STAGES)[number];

export interface StoredTransactionError {
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: number;
}

export interface TransactionJob {
  id: string;
  stage: TransactionStage;
  instruction: IncomingInstruction;
  attempts: number;
  nextAttemptAt: number | null;
  createdAt: number;
  updatedAt: number;
  stageHistory?: Array<{
    stage: TransactionStage;
    at: number;
  }>;
  attestation?: {
    abiEncodedRequest: Hex;
    submissionTransactionHash?: Hex;
    votingRoundId?: bigint;
    finalized?: boolean;
  };
  proof?: XrpPaymentProof;
  execution?: {
    transactionHash: Hex;
    assetManager: Address;
  };
  /** ABI-encoded PackedUserOperation for 0xFE mint+deposit jobs. */
  userOpData?: Hex;
  settlement?: DirectMintingSettlement;
  lastError?: StoredTransactionError;
}

export interface TransactionStore {
  initialize(): Promise<void>;
  createIfAbsent(job: TransactionJob): Promise<{
    job: TransactionJob;
    created: boolean;
  }>;
  get(id: string): Promise<TransactionJob | null>;
  list(): Promise<TransactionJob[]>;
  update(
    id: string,
    updater: (job: TransactionJob) => TransactionJob,
  ): Promise<TransactionJob>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryTransactionStore implements TransactionStore {
  protected readonly jobs = new Map<string, TransactionJob>();

  async initialize(): Promise<void> {}

  async createIfAbsent(job: TransactionJob) {
    const existing = this.jobs.get(job.id);
    if (existing) return { job: clone(existing), created: false };
    this.jobs.set(job.id, clone(job));
    return { job: clone(job), created: true };
  }

  async get(id: string): Promise<TransactionJob | null> {
    const job = this.jobs.get(id);
    return job ? clone(job) : null;
  }

  async list(): Promise<TransactionJob[]> {
    return [...this.jobs.values()].map(clone);
  }

  async update(
    id: string,
    updater: (job: TransactionJob) => TransactionJob,
  ): Promise<TransactionJob> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error(`Transaction job ${id} does not exist`);
    const updated = updater(clone(existing));
    if (updated.id !== id) throw new Error("Transaction job id cannot change");
    this.jobs.set(id, clone(updated));
    return clone(updated);
  }
}

function stringifyJobs(jobs: TransactionJob[]): string {
  return JSON.stringify(
    { version: 1, jobs },
    (_key, value) =>
      typeof value === "bigint" ? { $flarerampBigInt: value.toString() } : value,
    2,
  );
}

function parseJobs(value: string): TransactionJob[] {
  const parsed = JSON.parse(value, (_key, entry) => {
    if (
      typeof entry === "object" &&
      entry !== null &&
      Object.keys(entry).length === 1 &&
      typeof entry.$flarerampBigInt === "string"
    ) {
      return BigInt(entry.$flarerampBigInt);
    }
    return entry;
  }) as { version?: unknown; jobs?: unknown };
  if (parsed.version !== 1 || !Array.isArray(parsed.jobs)) {
    throw new Error("Unsupported transaction store format");
  }
  return parsed.jobs as TransactionJob[];
}

export class JsonFileTransactionStore extends MemoryTransactionStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {
    super();
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const jobs = parseJobs(await readFile(this.filePath, "utf8"));
      this.jobs.clear();
      for (const job of jobs) this.jobs.set(job.id, clone(job));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist();
    }
  }

  override createIfAbsent(job: TransactionJob) {
    return this.exclusive(async () => {
      const result = await super.createIfAbsent(job);
      if (result.created) await this.persist();
      return result;
    });
  }

  override update(
    id: string,
    updater: (job: TransactionJob) => TransactionJob,
  ) {
    return this.exclusive(async () => {
      const updated = await super.update(id, updater);
      await this.persist();
      return updated;
    });
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, stringifyJobs([...this.jobs.values()]), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }
}
