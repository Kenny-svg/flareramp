"use client";

import { useCallback, useEffect, useState } from "react";

interface ProofReceipt {
  version: 1;
  network: "XRPL Testnet / Coston2";
  generatedAt: string;
  status: string;
  elapsedSeconds: number;
  xrpl: {
    transactionHash: string;
    validated: boolean;
    ledgerIndex: number | null;
    confirmations: number | null;
    timestamp: string | null;
    explorerUrl: string;
  };
  fdc: {
    attestationRequestTransactionHash: string | null;
    attestationRequestExplorerUrl: string | null;
    votingRoundId: string | null;
    finalized: boolean;
    merkleProofStatus: "pending" | "available" | "rejected";
    sourceTimestamp: string | null;
  };
  flare: {
    transactionHash: string | null;
    blockNumber: string | null;
    explorerUrl: string | null;
    timestamp: string | null;
  };
  fxrp: {
    recipient: string | null;
    receivedUBA: string | null;
    mintingFeeUBA: string | null;
    executorFeeUBA: string | null;
  };
  timeline: Array<{
    stage: string;
    timestamp: string;
    source: string;
  }>;
  diagnosis: {
    severity: "info" | "warn" | "error";
    title: string;
    evidence: string[];
    guidance: string[];
  };
  recoveryBoundary: string;
  sources: Array<{
    label: string;
    url: string;
    timestamp: string;
  }>;
}

function dropsToXrp(drops: string | null): string {
  if (!drops) return "Pending";
  const padded = drops.padStart(7, "0");
  const whole = padded.slice(0, -6);
  const fraction = padded.slice(-6).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function formatTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return "Pending";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getUTCMonth()];
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
    let hours = date.getUTCHours();
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds} ${ampm} (UTC)`;
  } catch {
    return dateStr;
  }
}


export function ProofReceiptView({
  transactionId,
}: {
  transactionId: string;
}) {
  const [receipt, setReceipt] = useState<ProofReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/mint/receipt/${transactionId}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as ProofReceipt | { error: string };
    if (!response.ok) {
      throw new Error(
        "error" in data ? data.error : "Could not load proof receipt",
      );
    }
    setReceipt(data as ProofReceipt);
    setError(null);
  }, [transactionId]);

  useEffect(() => {
    void refresh().catch((cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [refresh]);

  useEffect(() => {
    if (
      !receipt ||
      receipt.status === "minted" ||
      receipt.status === "failed" ||
      receipt.status === "recovery_required"
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh().catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [receipt, refresh]);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  function downloadJson() {
    if (!receipt) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(receipt, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `flareramp-proof-${receipt.xrpl.transactionHash}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="bg-red-950/15 border border-red-900/50 p-8 rounded-2xl text-center max-w-md shadow-2xl">
          <svg className="h-12 w-12 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h1 className="text-xl font-bold text-white mb-2">Proof Receipt unavailable</h1>
          <p role="alert" className="text-red-400 text-sm mb-6 leading-relaxed">{error}</p>
          <button
            onClick={() => void refresh()}
            className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all uppercase tracking-wider"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }
  if (!receipt) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4 text-center">
          <svg className="animate-spin h-10 w-10 text-brand-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <h1 className="text-xl font-bold text-zinc-300">Building public Proof Receipt…</h1>
          <p className="text-zinc-500 text-xs">Fetching validated onchain information from public providers</p>
        </div>
      </main>
    );
  }

  const diagnosisBorderClass =
    receipt.diagnosis.severity === "error"
      ? "border-red-500 bg-red-950/5 shadow-[0_0_15px_rgba(239,68,68,0.02)]"
      : receipt.diagnosis.severity === "warn"
        ? "border-amber-500 bg-amber-950/5 shadow-[0_0_15px_rgba(245,158,11,0.02)]"
        : "border-blue-500 bg-blue-950/5 shadow-[0_0_15px_rgba(59,130,246,0.02)]";

  const diagnosisHeadingColor =
    receipt.diagnosis.severity === "error"
      ? "text-red-400"
      : receipt.diagnosis.severity === "warn"
        ? "text-amber-400"
        : "text-blue-400";

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <header className="mb-8 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-zinc-900 pb-8">
        <div>
          <p className="text-brand-500 font-extrabold text-sm tracking-wider uppercase mb-2">
            FLARERAMP PROOF
          </p>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
            Public Proof Receipt
          </h1>
          <p className="text-zinc-400 text-sm">
            Status: <span className="font-bold text-zinc-200 capitalize">{receipt.status}</span> · Elapsed:{" "}
            <span className="font-semibold text-zinc-200 font-mono">{receipt.elapsedSeconds}s</span> · Generated:{" "}
            <span className="font-mono text-zinc-300">{formatTimestamp(receipt.generatedAt)}</span>
          </p>
        </div>

        <div className="flex flex-wrap justify-center md:justify-end gap-3">
          <button
            onClick={copyLink}
            className="bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-850 text-zinc-300 hover:text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all uppercase tracking-wider"
          >
            {copied ? "Link copied" : "Copy share link"}
          </button>
          <button
            onClick={downloadJson}
            className="bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-850 text-zinc-300 hover:text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all uppercase tracking-wider"
          >
            Download JSON
          </button>
          <button
            onClick={() => void refresh()}
            className="bg-brand-500 hover:bg-brand-400 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all uppercase tracking-wider shadow-[0_4px_15px_rgba(232,93,53,0.15)]"
          >
            Refresh evidence
          </button>
        </div>
      </header>

      <section className="mt-10">
        <h2 className="text-lg font-bold text-zinc-450 mb-6 uppercase tracking-wider">Evidence</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <article className="bg-zinc-900/20 border border-zinc-800/80 p-6 rounded-2xl shadow-xl flex flex-col justify-between hover:border-zinc-700/80 transition-all group">
            <div>
              <h3 className="text-base font-bold text-white mb-4 border-b border-zinc-800/50 pb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 group-hover:animate-pulse"></span>
                XRPL Payment
              </h3>
              <div className="space-y-2 text-sm text-zinc-400 mb-6 font-medium">
                <p>Status: <span className="text-zinc-200 font-semibold">{receipt.xrpl.validated ? "Validated" : "Validation unavailable"}</span></p>
                <p>Ledger: <span className="text-zinc-200 font-mono text-xs">{receipt.xrpl.ledgerIndex ?? "Pending"}</span></p>
                <p>Confirmations: <span className="text-zinc-200 font-mono text-xs">{receipt.xrpl.confirmations ?? "Pending"}</span></p>
                <p className="text-[10px] text-zinc-500 font-mono mt-1">{receipt.xrpl.timestamp ? formatTimestamp(receipt.xrpl.timestamp) : "Timestamp pending"}</p>
              </div>
            </div>
            <a
              href={receipt.xrpl.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-brand-400 hover:text-brand-300 font-semibold text-xs underline group-hover:no-underline transition-all"
            >
              <span>View XRPL transaction</span>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </article>

          <article className="bg-zinc-900/20 border border-zinc-800/80 p-6 rounded-2xl shadow-xl flex flex-col justify-between hover:border-zinc-700/80 transition-all group">
            <div>
              <h3 className="text-base font-bold text-white mb-4 border-b border-zinc-800/50 pb-2 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${receipt.fdc.votingRoundId ? "bg-emerald-500" : "bg-amber-500"} group-hover:animate-pulse`}></span>
                FDC Attestation
              </h3>
              <div className="space-y-2 text-sm text-zinc-400 mb-6 font-medium">
                <p>Voting round: <span className="text-zinc-200 font-mono text-xs">{receipt.fdc.votingRoundId ?? "Pending"}</span></p>
                <p>Finalized: <span className="text-zinc-200 font-semibold">{receipt.fdc.finalized ? "Yes" : "No"}</span></p>
                <p>Merkle proof: <span className="text-zinc-200 font-semibold capitalize">{receipt.fdc.merkleProofStatus}</span></p>
                <p className="text-[10px] text-zinc-500 font-mono mt-1">{receipt.fdc.sourceTimestamp ? formatTimestamp(receipt.fdc.sourceTimestamp) : "Timestamp pending"}</p>
              </div>
            </div>
            {receipt.fdc.attestationRequestExplorerUrl && (
              <a
                href={receipt.fdc.attestationRequestExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-brand-400 hover:text-brand-300 font-semibold text-xs underline group-hover:no-underline transition-all"
              >
                <span>View attestation request</span>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </article>

          <article className="bg-zinc-900/20 border border-zinc-800/80 p-6 rounded-2xl shadow-xl flex flex-col justify-between hover:border-zinc-700/80 transition-all group">
            <div>
              <h3 className="text-base font-bold text-white mb-4 border-b border-zinc-800/50 pb-2 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${receipt.flare.blockNumber ? "bg-emerald-500" : "bg-zinc-700"} group-hover:animate-pulse`}></span>
                Flare Settlement
              </h3>
              <div className="space-y-2 text-sm text-zinc-400 mb-6 font-medium">
                <p>Block: <span className="text-zinc-200 font-mono text-xs">{receipt.flare.blockNumber ?? "Pending"}</span></p>
                <p>Received: <span className="text-brand-400 font-bold">{dropsToXrp(receipt.fxrp.receivedUBA)} FXRP</span></p>
                <p className="overflow-wrap-anywhere break-all">Recipient: <span className="text-zinc-200 font-mono text-[10px] block">{receipt.fxrp.recipient ?? "Pending"}</span></p>
                <p className="text-[10px] text-zinc-500 font-mono mt-1">{receipt.flare.timestamp ? formatTimestamp(receipt.flare.timestamp) : "Timestamp pending"}</p>
              </div>
            </div>
            {receipt.flare.explorerUrl && (
              <a
                href={receipt.flare.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-brand-400 hover:text-brand-300 font-semibold text-xs underline group-hover:no-underline transition-all"
              >
                <span>View Coston2 transaction</span>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </article>
        </div>
      </section>

      <section className="bg-zinc-900/30 border border-zinc-800/80 backdrop-blur-md p-6 rounded-2xl shadow-xl mt-8">
        <h2 className="text-lg font-bold text-white mb-6 border-b border-zinc-800 pb-3 uppercase tracking-wider">Checkpoint Timeline</h2>
        {receipt.timeline.length === 0 ? (
          <p className="text-zinc-500 text-sm py-4">Waiting for the executor&apos;s first durable checkpoint.</p>
        ) : (
          <div className="relative pl-6 border-l border-zinc-800 space-y-6">
            {receipt.timeline.map((entry, index) => (
              <div key={`${entry.stage}-${index}`} className="relative">
                <span className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 border-4 border-zinc-950"></span>
                <div>
                  <h4 className="text-zinc-200 text-sm font-bold">{entry.stage}</h4>
                  <p className="text-[10px] text-zinc-550 font-mono mt-0.5">{formatTimestamp(entry.timestamp)}</p>
                  <p className="text-zinc-400 text-xs mt-1 bg-zinc-950/40 p-2 rounded border border-zinc-900 inline-block">{entry.source}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`border-l-4 p-6 rounded-r-2xl mt-8 transition-all ${diagnosisBorderClass}`}>
        <h2 className={`text-lg font-bold ${diagnosisHeadingColor} mb-2 uppercase tracking-wider`}>
          {receipt.diagnosis.title}
        </h2>
        
        <div className="mt-4 space-y-4 text-sm">
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-2">Evidence Captured</h4>
            <ul className="list-disc pl-4 space-y-1 text-zinc-300">
              {receipt.diagnosis.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-2">Recovery Guidance</h4>
            <ol className="list-decimal pl-4 space-y-1 text-zinc-300">
              {receipt.diagnosis.guidance.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          
          <div className="pt-2 border-t border-zinc-900/60 flex items-center justify-between text-xs">
            <span className="text-zinc-400">Recovery boundary:</span>
            <span className="font-mono text-zinc-300 font-semibold">{receipt.recoveryBoundary}</span>
          </div>
        </div>
      </section>

      <section className="bg-zinc-900/30 border border-zinc-800/80 backdrop-blur-md p-6 rounded-2xl shadow-xl mt-8">
        <h2 className="text-sm font-bold text-zinc-450 mb-4 uppercase tracking-wider">Public Sources</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium">
          {receipt.sources.map((source) => (
            <li key={source.url} className="bg-zinc-950/40 p-3 rounded-xl border border-zinc-900 hover:border-zinc-800 transition-all flex flex-col justify-between gap-1">
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="text-brand-400 hover:text-brand-300 underline font-semibold break-all"
              >
                {source.label}
              </a>
              <span className="text-[10px] text-zinc-500 font-mono block mt-1">Fetched: {formatTimestamp(source.timestamp)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
