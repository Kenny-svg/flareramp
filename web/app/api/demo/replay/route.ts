import { NextResponse } from "next/server";
import { getRecordedReplay } from "@/lib/server/recordedReplay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(getRecordedReplay(), {
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-FlareRamp-Demo-Mode": "recorded-not-live",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Replay unavailable" },
      { status: 404 },
    );
  }
}
