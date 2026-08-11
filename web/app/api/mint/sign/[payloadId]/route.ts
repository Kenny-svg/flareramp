import { NextResponse } from "next/server";
import { getXamanDirectMintService } from "@/lib/server/mintFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { payloadId: string };
}

function validPayloadId(value: string): boolean {
  return /^[0-9a-f-]{20,64}$/i.test(value);
}

export async function GET(_request: Request, context: RouteContext) {
  if (!validPayloadId(context.params.payloadId)) {
    return NextResponse.json(
      { error: "Malformed Xaman payload identifier" },
      { status: 400 },
    );
  }
  try {
    const status = await getXamanDirectMintService().status(
      context.params.payloadId,
    );
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not read the signing request",
      },
      { status: 502 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!validPayloadId(context.params.payloadId)) {
    return NextResponse.json(
      { error: "Malformed Xaman payload identifier" },
      { status: 400 },
    );
  }
  try {
    const status = await getXamanDirectMintService().cancel(
      context.params.payloadId,
    );
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not cancel the signing request",
      },
      { status: 502 },
    );
  }
}
