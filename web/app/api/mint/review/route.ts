import { NextResponse } from "next/server";
import { createMintReview, type MintReviewInput } from "@/lib/server/mintFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as MintReviewInput;
    const review = await createMintReview(input);
    return NextResponse.json(review, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not prepare the mint review",
      },
      { status: 400 },
    );
  }
}
