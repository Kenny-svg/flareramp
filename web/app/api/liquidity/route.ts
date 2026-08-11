import { NextResponse } from "next/server";
import { getLiquidityOverview } from "@/lib/server/liquidityMap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const overview = await getLiquidityOverview();
    return NextResponse.json(overview, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load liquidity overview",
      },
      { status: 502 },
    );
  }
}
