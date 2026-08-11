import { NextResponse } from "next/server";
import {
  assertSigningReady,
  createMintReview,
  getXamanDirectMintService,
  paymentTemplateFromReview,
  type MintReviewInput,
} from "@/lib/server/mintFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as MintReviewInput;
    const review = await createMintReview(input);
    assertSigningReady(review);
    const signing = await getXamanDirectMintService().create(
      paymentTemplateFromReview(review),
    );
    return NextResponse.json(
      { review, signing },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not open the Xaman signing request",
      },
      { status: 400 },
    );
  }
}
