import Link from "next/link";
import { DirectMintSigning } from "@/components/DirectMintSigning";

export default function HomePage() {
  return (
    <main>
      <div className="max-w-4xl mx-auto px-4 pt-8 flex justify-end">
        <Link
          href="/portfolio"
          className="text-sm font-semibold text-zinc-400 hover:text-brand-400 transition-colors uppercase tracking-wider"
        >
          Portfolio &amp; agent risk →
        </Link>
      </div>
      <DirectMintSigning />
    </main>
  );
}
