import { NextResponse } from "next/server";
import {
  assertSmartAccountSigningReady,
  createSmartAccountReview,
  getXamanInstructionService,
  instructionTemplateFromReview,
  type SmartAccountReviewInput,
} from "@/lib/server/smartAccountFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as SmartAccountReviewInput;
    const review = await createSmartAccountReview(input);
    assertSmartAccountSigningReady(review);
    const signing = await getXamanInstructionService().create(
      instructionTemplateFromReview(review),
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
