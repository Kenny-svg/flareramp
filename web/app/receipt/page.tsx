import Link from "next/link";
import { listPublicSettlements } from "@/lib/server/mintStatus";
import { ReceiptLookup } from "@/components/ReceiptLookup";

export const dynamic = "force-dynamic";

const XRPL_EXPLORER = "https://testnet.xrpl.org/transactions";
const COSTON2_EXPLORER = "https://coston2-explorer.flare.network/tx";

function formatFxrp(uba: string | undefined): string {
  if (!uba) return "—";
  const value = Number(uba) / 1_000_000;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} FXRP`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

/**
 * Public Proof Receipt index — the cold-open entry point to FlareRamp.
 *
 * Deliberately requires no wallet, no signing and no connection flow: every
 * row is a mint that already settled on both ledgers, with links out to the
 * XRPL and Coston2 explorers so a reader can verify each claim independently
 * rather than trusting this page. Individual receipts live at
 * /receipt/[transactionId] and carry the full FDC timeline and diagnosis.
 */
export default async function ReceiptIndexPage() {
  const { settlements, checkedAt, reachable } = await listPublicSettlements();

  return (
    <main className="max-w-5xl mx-auto px-4 py-12 flex flex-col gap-8">
      <header>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-4">
          Proof Receipts
        </h1>
        <p className="text-zinc-400 max-w-2xl leading-relaxed text-base md:text-lg">
          Every FlareRamp mint that has settled end to end: an XRPL Testnet payment, an FDC
          attestation of that payment, and the resulting Coston2 FXRP settlement. No wallet, no
          signing — each row links to both public explorers so you can verify it without trusting
          this page.
        </p>
      </header>

      <ReceiptLookup />

      {!reachable && (
        <p className="text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          The executor is not reachable right now, so the settled-mint index cannot be loaded. Look
          up a specific transaction above, or see the{" "}
          <Link href="/demo/replay" className="underline hover:text-amber-300">
            recorded replay
          </Link>
          , which is explicitly labelled and never submits transactions.
        </p>
      )}

      {reachable && settlements.length === 0 && (
        <p className="text-zinc-400 text-sm bg-zinc-900/40 border border-zinc-800 rounded-xl px-4 py-3">
          No mints have settled yet. Once a mint completes, it appears here automatically. In the
          meantime, the{" "}
          <Link href="/demo/replay" className="underline hover:text-zinc-200">
            recorded replay
          </Link>{" "}
          walks through a previously captured run.
        </p>
      )}

      {settlements.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-zinc-500 uppercase text-xs tracking-wider border-b border-zinc-800">
                <th className="py-2 pr-4">Settled</th>
                <th className="py-2 pr-4">Minted</th>
                <th className="py-2 pr-4">XRPL payment</th>
                <th className="py-2 pr-4">Coston2 settlement</th>
                <th className="py-2 pr-4">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((job) => (
                <tr key={job.transactionId} className="border-b border-zinc-900">
                  <td className="py-3 pr-4 text-zinc-400 whitespace-nowrap">
                    {new Date(job.updatedAt).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-zinc-200 whitespace-nowrap">
                    {formatFxrp(job.settlement?.mintedAmountUBA)}
                    {job.settlement?.vaultDeposit && (
                      <span className="ml-2 text-xs text-brand-400">→ vault</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    <a
                      href={`${XRPL_EXPLORER}/${job.transactionId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-400 hover:text-brand-300 underline"
                    >
                      {shortHash(job.transactionId)}
                    </a>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    {job.settlement?.flareTransactionHash ? (
                      <a
                        href={`${COSTON2_EXPLORER}/${job.settlement.flareTransactionHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-400 hover:text-brand-300 underline"
                      >
                        {shortHash(job.settlement.flareTransactionHash)}
                      </a>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Link
                      href={`/receipt/${job.transactionId}`}
                      className="text-brand-400 hover:text-brand-300 underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-zinc-600 text-xs mt-4">
            checked {new Date(checkedAt).toLocaleTimeString()} · newest 20 settled mints
          </p>
        </div>
      )}
    </main>
  );
}
