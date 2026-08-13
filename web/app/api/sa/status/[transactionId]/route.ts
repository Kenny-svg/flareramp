import { NextResponse } from "next/server";
import { getWebServerConfig } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: { transactionId: string } },
) {
  try {
    const transactionId = context.params.transactionId.replace(/^0x/i, "");
    if (!/^[0-9A-Fa-f]{64}$/.test(transactionId)) {
      return NextResponse.json(
        { error: "Malformed XRPL transaction identifier" },
        { status: 400 },
      );
    }
    const base = getWebServerConfig().executorStatusUrl.replace(/\/+$/, "");
    const response = await fetch(
      `${base}/transactions/${transactionId.toUpperCase()}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            typeof body.error === "string"
              ? body.error
              : "Executor status unavailable",
          executorReachable: response.status !== 404,
        },
        { status: response.status === 404 ? 404 : 502 },
      );
    }
    return NextResponse.json(
      { ...body, executorReachable: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not read Smart Account instruction status",
        executorReachable: false,
      },
      { status: 502 },
    );
  }
}
