import { getRecordedReplay } from "@/lib/server/recordedReplay";

export const dynamic = "force-dynamic";

function drops(value: string) {
  return `${Number(value) / 1_000_000}`;
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

export default function RecordedReplayPage() {
  let replay;
  try {
    replay = getRecordedReplay();
  } catch {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 flex items-center justify-center min-h-[50vh]">
        <div className="bg-zinc-900/30 border border-zinc-800/80 p-8 rounded-2xl text-center max-w-md shadow-xl">
          <svg className="h-10 w-10 text-zinc-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h1 className="text-lg font-bold text-white mb-2">Recorded demo is disabled</h1>
          <p className="text-zinc-400 text-sm">Set <code className="bg-zinc-955 px-1.5 py-0.5 rounded text-red-400 font-mono text-xs font-semibold">DEMO_REPLAY_ENABLED=true</code> on the web server to enable it.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div
        role="status"
        className="bg-brand-950/10 border-l-4 border-brand-500 p-5 rounded-r-2xl mb-10 text-brand-200/90 leading-relaxed text-sm shadow-[0_0_15px_rgba(232,93,53,0.02)]"
      >
        <strong className="block text-white font-bold mb-1 text-base">{replay.label}</strong>
        <p>
          This page replays public evidence captured on {formatTimestamp(replay.capturedAt)}.
          It never opens Xaman, requests a new proof, or submits a transaction.
        </p>
      </div>

      <header className="mb-8 border-b border-zinc-900 pb-6">
        <h1 className="text-3xl font-black text-white mb-2">Successful FXRP mint replay</h1>
        <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider">{replay.network}</p>
      </header>

      <div className="relative pl-6 border-l border-zinc-800 space-y-6">
        {/* Step 1 */}
        <div className="relative">
          <span className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 border-4 border-zinc-950"></span>
          <div className="bg-zinc-900/20 border border-zinc-805/60 p-5 rounded-2xl hover:border-zinc-705/60 transition-all">
            <h3 className="text-zinc-200 text-sm font-bold mb-1">XRPL payment verified</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Sent <strong className="text-white font-semibold">{drops(replay.xrpl.amountDrops)} TestXRP</strong> in ledger{" "}
              <span className="font-mono text-zinc-300 font-semibold">{replay.xrpl.ledgerIndex}</span>.
              <a
                href={replay.xrpl.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-brand-400 hover:text-brand-300 font-semibold underline inline-flex items-center gap-0.5 ml-2"
              >
                <span>Verify on XRPL</span>
                <svg className="h-3 w-3 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="relative">
          <span className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 border-4 border-zinc-950"></span>
          <div className="bg-zinc-900/20 border border-zinc-850 p-5 rounded-2xl">
            <h3 className="text-zinc-200 text-sm font-bold mb-1">FDC Attestation Proof</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              FDC voting round <strong className="text-white font-semibold font-mono">{replay.fdc.votingRoundId}</strong>; 
              Merkle proof was verified and recorded as available for execution.
            </p>
          </div>
        </div>

        {/* Step 3 */}
        <div className="relative">
          <span className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 border-4 border-zinc-950"></span>
          <div className="bg-zinc-900/20 border border-zinc-805/60 p-5 rounded-2xl hover:border-zinc-705/60 transition-all">
            <h3 className="text-zinc-200 text-sm font-bold mb-1">Coston2 Settlement completed</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Confirmed settlement on Coston2 in block <span className="font-mono text-zinc-300 font-semibold">{replay.flare.blockNumber}</span>.
              <a
                href={replay.flare.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-brand-400 hover:text-brand-300 font-semibold underline inline-flex items-center gap-0.5 ml-2"
              >
                <span>Verify on Coston2</span>
                <svg className="h-3 w-3 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </p>
          </div>
        </div>

        {/* Step 4 */}
        <div className="relative">
          <span className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-4 border-zinc-950"></span>
          <div className="bg-emerald-950/5 border border-emerald-900/25 p-5 rounded-2xl">
            <h3 className="text-emerald-400 text-sm font-bold mb-1">FXRP Minted</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Successfully received <strong className="text-emerald-400 font-semibold">{drops(replay.fxrp.receivedUBA)} FXRP</strong> at{" "}
              <span className="font-mono text-zinc-300 break-all">{replay.fxrp.recipient}</span>.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
