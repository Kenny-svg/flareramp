import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { getCrossChainFxrpBalances } from "@/lib/server/crossChainBalances";
import type { FassetsNetwork } from "@/lib/server/agentRisk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNetwork(value: string | null): FassetsNetwork {
  if (value === "flare") return "flare";
  return "coston2";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("address");
  const network = parseNetwork(searchParams.get("network"));

  if (!raw || !isAddress(raw)) {
    return NextResponse.json({ error: "A valid EVM address (0x...) is required" }, { status: 400 });
  }

  try {
    const result = await getCrossChainFxrpBalances(network, getAddress(raw));
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load cross-chain balances",
      },
      { status: 502 },
    );
  }
}
