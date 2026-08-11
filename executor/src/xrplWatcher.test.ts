import { describe, expect, it, vi } from "vitest";

vi.mock("xrpl", () => ({ Client: class {} }));

import {
  runReconnectingXrplWatcher,
  type ReconnectingWatcherOptions,
} from "./xrplWatcher";

describe("runReconnectingXrplWatcher", () => {
  it("reconnects with bounded exponential backoff", async () => {
    const abortController = new AbortController();
    const delays: number[] = [];
    const connect = vi.fn().mockRejectedValue(new Error("offline"));
    const sleep = vi.fn(async (milliseconds: number) => {
      delays.push(milliseconds);
      if (delays.length === 3) abortController.abort();
    });

    await runReconnectingXrplWatcher(
      "wss://xrpl.example",
      "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY",
      vi.fn(),
      {
        signal: abortController.signal,
        initialBackoffMs: 100,
        maxBackoffMs: 250,
        connect:
          connect as unknown as NonNullable<
            ReconnectingWatcherOptions["connect"]
          >,
        sleep,
      },
    );

    expect(connect).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200, 250]);
  });
});
