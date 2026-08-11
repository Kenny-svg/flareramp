import { NextResponse } from "next/server";
import { getMintProgress } from "@/lib/server/mintStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { transactionId: string };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const recipient = new URL(request.url).searchParams.get("recipient");
    if (!recipient) {
      return NextResponse.json(
        { error: "FXRP recipient is required" },
        { status: 400 },
      );
    }
    const progress = await getMintProgress(
      context.params.transactionId,
      recipient,
    );
    return NextResponse.json(progress, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not read mint progress",
      },
      { status: 400 },
    );
  }
}
