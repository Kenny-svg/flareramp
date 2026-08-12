import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Hex } from "viem";

export interface StoredUserOp {
  memoHash: Hex;
  userOpData: Hex;
  sourceAddress: string;
  createdAt: number;
}

export class JsonFileUserOpStore {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly entries = new Map<string, StoredUserOp>();

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { version?: number; entries?: StoredUserOp[] };
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return;
      for (const entry of parsed.entries) {
        this.entries.set(entry.memoHash.toLowerCase(), entry);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist();
    }
  }

  async put(entry: StoredUserOp): Promise<void> {
    return this.exclusive(async () => {
      this.entries.set(entry.memoHash.toLowerCase(), entry);
      await this.persist();
    });
  }

  async get(memoHash: string): Promise<StoredUserOp | null> {
    return this.entries.get(memoHash.toLowerCase()) ?? null;
  }

  async getBySource(sourceAddress: string): Promise<StoredUserOp | null> {
    const matches = [...this.entries.values()]
      .filter(
        (entry) =>
          entry.sourceAddress.toLowerCase() === sourceAddress.toLowerCase(),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    return matches[0] ?? null;
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
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      JSON.stringify(
        { version: 1, entries: [...this.entries.values()] },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporaryPath, this.filePath);
  }
}
