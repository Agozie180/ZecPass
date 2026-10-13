import { NextResponse } from "next/server";
import { appendReveal } from "@/lib/board/store";

/**
 * POST /api/auctions/:id/reveals — publish a reveal.
 *
 * From this point the amount is public: that is what opening a sealed bid means.
 * The board stores the proof; each visitor verifies it in their own browser
 * against the commitment sealed earlier, so a dishonest reveal is caught by the
 * reader rather than trusted by the server.
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
  const amount = Number(b.amount);
  if (!Number.isInteger(amount) || amount < 0) {
    return NextResponse.json({ error: "amount must be a non-negative whole number." }, { status: 400 });
  }
  const strings = ["commitment", "bidderBinding", "proofHex"] as const;
  for (const key of strings) {
    if (typeof b[key] !== "string" || (b[key] as string).length === 0) {
      return NextResponse.json({ error: `Missing "${key}".` }, { status: 400 });
    }
  }

  const result = await appendReveal(id, {
    commitment: b.commitment as string,
    amount,
    bidderBinding: b.bidderBinding as string,
    proofHex: b.proofHex as string,
    publicInputs,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ reveal: result.reveal }, { status: 201 });
}
