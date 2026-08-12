import { NextResponse } from "next/server";
import { listPublicSettlements } from "@/lib/server/mintStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public index of settled mints, backing the no-wallet `/receipt` page.
 * Never 500s on an unreachable executor — the page renders an honest
 * "executor offline" state instead (see listPublicSettlements).
 */
export async function GET() {
  const index = await listPublicSettlements();
  return NextResponse.json(index, {
    headers: { "Cache-Control": "no-store" },
  });
}
