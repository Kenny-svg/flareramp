"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const XRPL_TX_HASH = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Look up a Proof Receipt by XRPL transaction hash. Kept client-side so the
 * index page itself stays a server component with no wallet dependency.
 */
export function ReceiptLookup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!XRPL_TX_HASH.test(trimmed)) {
      setError("Enter a 64-character XRPL transaction hash");
      return;
    }
    setError(null);
    router.push(`/receipt/${trimmed.replace(/^0x/i, "").toUpperCase()}`);
  }

  return (
    <section className="bg-zinc-900/30 border border-zinc-800/80 backdrop-blur-md p-6 rounded-2xl">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="XRPL transaction hash"
          aria-label="XRPL transaction hash"
          className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-zinc-700 font-mono text-sm"
        />
        <button
          type="submit"
          className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold px-6 py-3 rounded-xl transition-all text-sm uppercase tracking-wider"
        >
          Open receipt
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
    </section>
  );
}
