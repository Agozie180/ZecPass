import { NextResponse } from "next/server";
import { appendSealedBid } from "@/lib/board/store";

/**
 * POST /api/auctions/:id/bids — publish a sealed bid.
 *
 * The body carries only public commitments and the proof; the bid amount is not
 * here and is never sent. The auctioneer's copy of the bid arrives separately in
 * a shielded memo, and this board is the public, auditable commitment.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const publicInputs = Array.isArray(b.publicInputs) ? b.publicInputs.map((v) => String(v)) : null;
  if (!publicInputs || publicInputs.length === 0) {
    return NextResponse.json({ error: "publicInputs must be a non-empty array." }, { status: 400 });
  }

  const strings = ["commitment", "bidderBinding", "nullifier", "proofCommitment", "proofHex", "submittedAt"] as const;
  for (const key of strings) {
    if (typeof b[key] !== "string" || (b[key] as string).length === 0) {
      return NextResponse.json({ error: `Missing "${key}".` }, { status: 400 });
    }
  }

  const result = await appendSealedBid(id, {
    commitment: b.commitment as string,
    bidderBinding: b.bidderBinding as string,
    nullifier: b.nullifier as string,
    proofCommitment: b.proofCommitment as string,
    submittedAt: b.submittedAt as string,
    proofHex: b.proofHex as string,
    publicInputs,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ bid: result.bid }, { status: 201 });
}
