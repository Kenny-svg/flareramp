import { NextResponse } from "next/server";
import {
  createSmartAccountReview,
  type SmartAccountReviewInput,
} from "@/lib/server/smartAccountFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as SmartAccountReviewInput;
    const review = await createSmartAccountReview(input);
    return NextResponse.json(review, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not build the Smart Account instruction review",
      },
      { status: 400 },
    );
  }
}
