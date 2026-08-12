import { NextResponse } from "next/server";
import { keccak256 } from "viem";
import {
  assertSigningReady,
  createMintReview,
  getXamanDirectMintService,
  paymentTemplateFromReview,
  registerUserOpWithExecutor,
  type MintReviewInput,
} from "@/lib/server/mintFlow";
import { isVaultDestination } from "@/lib/mintDestination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as MintReviewInput;
    const review = await createMintReview(input);
    assertSigningReady(review);

    if (
      isVaultDestination(review.destination) &&
      review.userOpData &&
      review.transaction.memoData
    ) {
      await registerUserOpWithExecutor({
        memoHash: keccak256(review.transaction.memoData),
        userOpData: review.userOpData,
        sourceAddress: review.transaction.sourceAddress,
      });
    }

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
