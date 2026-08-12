"use client";

import { useState } from "react";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  getAddress,
  type Hex,
} from "viem";
import { coston2 } from "@/lib/chains";
import { REDEEM_WRITE_ABI } from "@/lib/redeemAbi";

interface RedeemQuote {
  checkedAt: string;
  assetManager: string;
  fxrpToken: string;
  lotSizeUBA: string;
  minimumRedeemAmountUBA: string;
  redeemWithTagSupported: boolean;
  balanceUBA: string;
  balanceFxrp: string;
  amountUBA: string;
  amountFxrp: string;
  lotsEquivalent: string;
  xrplDestination: string;
  destinationTag: string | null;
  warnings: string[];
}

interface RedeemWritePayload {
  quote: RedeemQuote;
  write: {
    abi: unknown[];
    assetManager: string;
    functionName: "redeemAmount" | "redeemWithTag";
    args: unknown[];
  };
}

function messageFromResponse(value: unknown, fallback: string): string {
  return typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
    ? value.error
    : fallback;
}

export function ReverseRedeem() {
  const [walletAddress, setWalletAddress] = useState("");
  const [amountFxrp, setAmountFxrp] = useState("0.8");
  const [xrplDestination, setXrplDestination] = useState("");
  const [destinationTag, setDestinationTag] = useState("");
  const [quote, setQuote] = useState<RedeemWritePayload | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connectWallet() {
    setError(null);
    const ethereum = (
      window as Window & {
        ethereum?: {
          request: (args: {
            method: string;
            params?: unknown[];
          }) => Promise<unknown>;
        };
      }
    ).ethereum;
    if (!ethereum) {
      setError("MetaMask (or another Coston2 wallet) is required");
      return;
    }
    try {
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts[0]) throw new Error("No account returned");
      setWalletAddress(getAddress(accounts[0]));
      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${coston2.id.toString(16)}` }],
        });
      } catch {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${coston2.id.toString(16)}`,
              chainName: coston2.name,
              nativeCurrency: coston2.nativeCurrency,
              rpcUrls: [coston2.rpcUrls.default.http[0]],
              blockExplorerUrls: [coston2.blockExplorers.default.url],
            },
          ],
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function prepareQuote() {
    setBusy(true);
    setError(null);
    setTxHash(null);
    try {
      if (!walletAddress) throw new Error("Connect a Coston2 wallet first");
      const response = await fetch("/api/redeem/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          amountFxrp,
          xrplDestination,
          destinationTag: destinationTag.trim() || undefined,
        }),
      });
      const data = (await response.json()) as
        | RedeemWritePayload
        | { error: string };
      if (!response.ok || !("quote" in data)) {
        throw new Error(messageFromResponse(data, "Redeem quote failed"));
      }
      setQuote(data);
    } catch (cause) {
      setQuote(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitRedeem() {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      const ethereum = (
        window as Window & {
          ethereum?: { request: (args: unknown) => Promise<unknown> };
        }
      ).ethereum;
      if (!ethereum) throw new Error("MetaMask is required");
      const walletClient = createWalletClient({
        chain: coston2,
        transport: custom(ethereum),
        account: getAddress(walletAddress),
      });
      const data = encodeFunctionData({
        abi: REDEEM_WRITE_ABI,
        functionName: quote.write.functionName,
        args: quote.write.args as never,
      });
      const hash = await walletClient.sendTransaction({
        to: getAddress(quote.write.assetManager),
        data: data as Hex,
        value: 0n,
        chain: coston2,
        account: getAddress(walletAddress),
      });
      setTxHash(hash);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-4xl mx-auto px-4 pt-4 pb-12">
      <header className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          Redeem FXRP → XRPL
        </h2>
        <p className="text-zinc-400 text-sm max-w-2xl">
          Burn Coston2 FXRP from your wallet via FAssets{" "}
          <code className="text-zinc-300">redeemAmount</code>. An agent pays XRP
          to your XRPL address. You pay C2FLR gas in MetaMask.
        </p>
      </header>

      <div className="bg-zinc-900/30 border border-zinc-800/80 p-6 rounded-2xl space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <button
            type="button"
            onClick={() => void connectWallet()}
            className="px-4 py-2 text-sm font-semibold uppercase tracking-wider border border-zinc-700 text-zinc-200 hover:border-brand-500"
          >
            {walletAddress ? "Reconnect wallet" : "Connect MetaMask"}
          </button>
          {walletAddress && (
            <p className="font-mono text-xs text-zinc-400 break-all">
              {walletAddress}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            FXRP amount
            <input
              value={amountFxrp}
              onChange={(e) => setAmountFxrp(e.target.value)}
              className="mt-2 block w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-sm"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 sm:col-span-2">
            XRPL destination
            <input
              value={xrplDestination}
              onChange={(e) => setXrplDestination(e.target.value)}
              placeholder="r..."
              className="mt-2 block w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-sm"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 sm:col-span-3">
            Destination tag (optional)
            <input
              value={destinationTag}
              onChange={(e) => setDestinationTag(e.target.value)}
              placeholder="Only when redeemWithTag is supported"
              className="mt-2 block w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-sm"
            />
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void prepareQuote()}
            className="px-4 py-3 text-sm font-semibold uppercase tracking-wider bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50"
          >
            Check redeem
          </button>
          <button
            type="button"
            disabled={busy || !quote}
            onClick={() => void submitRedeem()}
            className="px-4 py-3 text-sm font-semibold uppercase tracking-wider border border-brand-500 text-brand-400 hover:bg-brand-950/30 disabled:opacity-50"
          >
            Submit in MetaMask
          </button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        {quote && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-zinc-950/40 border border-zinc-900 p-3 rounded-xl">
              <dt className="text-xs text-zinc-500 uppercase">Wallet balance</dt>
              <dd className="text-zinc-200">{quote.quote.balanceFxrp} FXRP</dd>
            </div>
            <div className="bg-zinc-950/40 border border-zinc-900 p-3 rounded-xl">
              <dt className="text-xs text-zinc-500 uppercase">Redeem amount</dt>
              <dd className="text-zinc-200">{quote.quote.amountFxrp} FXRP</dd>
            </div>
            <div className="bg-zinc-950/40 border border-zinc-900 p-3 rounded-xl">
              <dt className="text-xs text-zinc-500 uppercase">Minimum UBA</dt>
              <dd className="font-mono text-xs text-zinc-300">
                {quote.quote.minimumRedeemAmountUBA}
              </dd>
            </div>
            <div className="bg-zinc-950/40 border border-zinc-900 p-3 rounded-xl">
              <dt className="text-xs text-zinc-500 uppercase">Method</dt>
              <dd className="text-zinc-200">{quote.write.functionName}</dd>
            </div>
            {quote.quote.warnings.length > 0 && (
              <div className="sm:col-span-2 text-amber-400 text-xs space-y-1">
                {quote.quote.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
          </dl>
        )}

        {txHash && (
          <p className="text-sm text-emerald-400">
            Redemption submitted.{" "}
            <a
              className="underline"
              href={`https://coston2-explorer.flare.network/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Coston2 explorer
            </a>
            . XRP payout to XRPL is completed by an agent after the request is
            queued — watch the explorer and your XRPL wallet.
          </p>
        )}
      </div>
    </section>
  );
}
