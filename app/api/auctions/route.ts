import { NextResponse } from "next/server";
import { createAuctionRecord, listAuctions } from "@/lib/board/store";

/** GET /api/auctions — every auction on the public board, newest first. */
export async function GET() {
  const auctions = await listAuctions();
  return NextResponse.json({ auctions });
}

/**
 * POST /api/auctions — create an auction. The parameters are public (the price
 * is public, the bidders are not), so they are validated here directly.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  try {
    const auction = await createAuctionRecord({
      title: String(b.title ?? ""),
      description: String(b.description ?? ""),
      reservePrice: Number(b.reservePrice),
      currency: String(b.currency ?? "ZEC"),
      pricingRule: b.pricingRule === "vickrey" ? "vickrey" : "first-price",
      bidOpensAt: String(b.bidOpensAt ?? ""),
      bidClosesAt: String(b.bidClosesAt ?? ""),
      sellerAddress: String(b.sellerAddress ?? ""),
    });
    return NextResponse.json({ auction }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the auction." }, { status: 400 });
  }
}
