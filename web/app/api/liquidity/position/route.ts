import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getVaultPosition } from "@/lib/server/vaultPosition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vault = searchParams.get("vault");
  const address = searchParams.get("address");

  if (!vault || !isAddress(vault)) {
    return NextResponse.json({ error: "Missing or invalid `vault` address" }, { status: 400 });
  }
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Missing or invalid `address`" }, { status: 400 });
  }

  try {
    const position = await getVaultPosition(vault, address);
    return NextResponse.json(position, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load vault position" },
      { status: 502 },
    );
  }
}
