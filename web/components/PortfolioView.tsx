"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { ERC20_ABI, getFxrpTokenAddress, getPublicClient } from "@/lib/contracts";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

interface Balances {
  nativeC2Flr: string;
  fxrp: string;
}

export function PortfolioView() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function connectAndLoad() {
    if (!window.ethereum) {
      setStatus("error");
      setError("No EVM wallet detected (e.g. MetaMask). For XRPL-only users, use the Smart Accounts onboarding below instead.");
      return;
    }
    try {
      setStatus("connecting");
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const acct = accounts[0] as `0x${string}`;
      setAddress(acct);

      setStatus("loading");
      const client = getPublicClient("coston2");
      const [nativeBalance, fxrpTokenAddress] = await Promise.all([
        client.getBalance({ address: acct }),
        getFxrpTokenAddress("coston2"),
      ]);
      const [fxrpBalance, fxrpDecimals] = await Promise.all([
        client.readContract({
          address: fxrpTokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [acct],
        }),
        client.readContract({
          address: fxrpTokenAddress,
          abi: ERC20_ABI,
          functionName: "decimals",
        }),
      ]);

      setBalances({
        nativeC2Flr: formatUnits(nativeBalance, 18),
        fxrp: formatUnits(fxrpBalance, fxrpDecimals),
      });
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section>
      <h2>Portfolio</h2>
      <p>
        EVM-wallet view (Coston2). USD pricing via FTSO and the cross-chain FXRP OFT
        balance rollup are not wired up yet — see <code>CrossChainBalances.tsx</code> and{" "}
        <code>contracts/scripts/get-fassets-overview.ts</code> for what remains.
      </p>
      {!address && (
        <button onClick={connectAndLoad} disabled={status === "connecting"}>
          {status === "connecting" ? "Connecting…" : "Connect EVM wallet"}
        </button>
      )}
      {address && (
        <dl>
          <dt>Address</dt>
          <dd>{address}</dd>
          <dt>C2FLR</dt>
          <dd>{balances?.nativeC2Flr ?? (status === "loading" ? "Loading…" : "—")}</dd>
          <dt>FXRP</dt>
          <dd>{balances?.fxrp ?? (status === "loading" ? "Loading…" : "—")}</dd>
        </dl>
      )}
      {status === "error" && error && <p role="alert">{error}</p>}
    </section>
  );
}
