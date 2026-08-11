import { NextResponse } from "next/server";
import { buildProofReceipt } from "@/lib/server/proofReceipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { transactionId: string };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const receipt = await buildProofReceipt(context.params.transactionId);
    return NextResponse.json(receipt, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not build proof receipt",
      },
      { status: 400 },
    );
  }
}
