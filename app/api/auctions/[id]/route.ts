import { NextResponse } from "next/server";
import { getAuction } from "@/lib/board/store";

export const dynamic = "force-dynamic";

/** GET /api/auctions/:id — one auction with its sealed bids and reveals. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auction = await getAuction(id);
  if (!auction) return NextResponse.json({ error: `Unknown auction "${id}".` }, { status: 404 });
  return NextResponse.json({ auction });
}
