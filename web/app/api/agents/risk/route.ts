import { NextResponse } from "next/server";
import { getAgentRiskOverview, type FassetsNetwork } from "@/lib/server/agentRisk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNetwork(value: string | null): FassetsNetwork {
  if (value === "flare") return "flare";
  return "coston2";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const network = parseNetwork(searchParams.get("network"));
    const overview = await getAgentRiskOverview(network);
    return NextResponse.json(overview, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load agent risk overview",
      },
      { status: 502 },
    );
  }
}
