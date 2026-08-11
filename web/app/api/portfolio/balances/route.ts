import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { getCrossChainFxrpBalances } from "@/lib/server/crossChainBalances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("address");

  if (!raw || !isAddress(raw)) {
    return NextResponse.json({ error: "A valid EVM address (0x...) is required" }, { status: 400 });
  }

  try {
    const result = await getCrossChainFxrpBalances(getAddress(raw));
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
