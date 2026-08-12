import { NextResponse } from "next/server";
import {
  createRedeemQuote,
  REDEEM_WRITE_ABI,
  type RedeemQuoteInput,
} from "@/lib/server/redeemFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as RedeemQuoteInput;
    const quote = await createRedeemQuote(input);
    return NextResponse.json(
      {
        quote,
        write: {
          abi: REDEEM_WRITE_ABI,
          assetManager: quote.assetManager,
          functionName: quote.destinationTag ? "redeemWithTag" : "redeemAmount",
          args: quote.destinationTag
            ? [
                quote.amountUBA,
                quote.xrplDestination,
                "0x0000000000000000000000000000000000000000",
                quote.destinationTag,
              ]
            : [
                quote.amountUBA,
                quote.xrplDestination,
                "0x0000000000000000000000000000000000000000",
              ],
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not prepare the redeem quote",
      },
      { status: 400 },
    );
  }
}
