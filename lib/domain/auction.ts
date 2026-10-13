export type PricingRule = "first-price" | "vickrey";

export type Auction = {
  id: string; // stable id; also salts bidders' nullifiers
  title: string;
  description: string;
  reservePrice: number; // public, positive integer (display units)
  currency: string; // e.g. "ZEC" (display only)
  pricingRule: PricingRule;
  bidOpensAt: string; // ISO timestamp
  bidClosesAt: string; // ISO timestamp (> bidOpensAt)
  sellerAddress: string; // Zcash shielded address used for settlement
};

export type SealedBidRecord = {
  auctionId: string;
  commitment: string; // hex, hides the bid amount (pedersen(bid, blinding))
  bidderBinding: string; // hex, ties the bid to one bidder (non-repudiable)
  nullifier: string; // hex, one admissible bid per bidder per auction
  proofCommitment: string; // hex, locator/hash of the full proof bundle
  submittedAt: string; // ISO timestamp
};

export type VerifiedReveal = {
  auctionId: string;
  commitment: string; // must equal a known SealedBidRecord.commitment
  amount: number; // the revealed bid (already proven to open `commitment`)
  bidderBinding: string;
};

export type AuctionOutcome = {
  auctionId: string;
  winnerCommitment: string | null;
  winnerBinding: string | null;
  winningBid: number | null; // highest valid revealed amount
  clearingPrice: number | null; // first-price => winningBid; vickrey => 2nd-highest distinct amount, or reserve if only one valid bid
  sealedCount: number; // sealed bids accepted
  validRevealCount: number; // reveals that matched a sealed bid and cleared reserve
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Deterministic 32-bit FNV-1a rendered base36 — a short, stable, dependency-free suffix. */
const shortHash = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const deriveAuctionId = (title: string, bidOpensAt: string, bidClosesAt: string): string =>
  `${slugify(title) || "auction"}-${shortHash(`${title}|${bidOpensAt}|${bidClosesAt}`)}`;

/**
 * Validate and normalise auction parameters. The reserve and timing are public
 * (the price is public, the bidders are not), so they are checked here rather
 * than proven. Throws `RangeError` on any invalid field. When `id` is omitted a
 * stable id is derived from the title and timing — the id salts bidder
 * nullifiers, so it must be deterministic for the same auction.
 */
export function createAuction(input: Omit<Auction, "id"> & { id?: string }): Auction {
  if (input.title.trim().length === 0) {
    throw new RangeError("title must not be empty");
  }
  if (!Number.isInteger(input.reservePrice) || input.reservePrice <= 0) {
    throw new RangeError("reservePrice must be a positive integer");
  }
  if (input.pricingRule !== "first-price" && input.pricingRule !== "vickrey") {
    throw new RangeError('pricingRule must be "first-price" or "vickrey"');
  }
  if (input.sellerAddress.trim().length === 0) {
    throw new RangeError("sellerAddress must not be empty");
  }

  const opens = Date.parse(input.bidOpensAt);
  const closes = Date.parse(input.bidClosesAt);
  if (Number.isNaN(opens) || Number.isNaN(closes)) {
    throw new RangeError("bidOpensAt and bidClosesAt must be valid ISO timestamps");
  }
  if (closes <= opens) {
    throw new RangeError("bidClosesAt must be after bidOpensAt");
  }

  return {
    id: input.id ?? deriveAuctionId(input.title, input.bidOpensAt, input.bidClosesAt),
    title: input.title,
    description: input.description,
    reservePrice: input.reservePrice,
    currency: input.currency,
    pricingRule: input.pricingRule,
    bidOpensAt: input.bidOpensAt,
    bidClosesAt: input.bidClosesAt,
    sellerAddress: input.sellerAddress,
  };
}

/** True iff `now` is inside the bidding window: bidOpensAt <= now < bidClosesAt. */
export function isBiddingOpen(auction: Auction, nowIso: string): boolean {
  const now = Date.parse(nowIso);
  return Date.parse(auction.bidOpensAt) <= now && now < Date.parse(auction.bidClosesAt);
}

/**
 * Admit a sealed bid, enforcing the invariants this module can see: the bid may
 * not be admitted ahead of its own submission (the auction window itself lives
 * on `Auction` and is enforced by the caller via `isBiddingOpen`), and the
 * nullifier and commitment must each be unique in the accepted set. Returns a
 * new array on success and never mutates `existing`.
 */
export function acceptSealedBid(
  existing: SealedBidRecord[],
  bid: SealedBidRecord,
  nowIso: string,
): { ok: true; bids: SealedBidRecord[] } | { ok: false; reason: string } {
  if (Date.parse(bid.submittedAt) > Date.parse(nowIso)) {
    return { ok: false, reason: "Bidding is closed." };
  }
  if (existing.some((b) => b.nullifier === bid.nullifier)) {
    return { ok: false, reason: "One bid per bidder per auction." };
  }
  if (existing.some((b) => b.commitment === bid.commitment)) {
    return { ok: false, reason: "Duplicate bid commitment." };
  }
  return { ok: true, bids: [...existing, bid] };
}

type RevealMatch = { reveal: VerifiedReveal; bid: SealedBidRecord };

/**
 * Settle the auction from the sealed bids and their verified reveals. Reveals are
 * trusted to genuinely open their commitment (proven elsewhere); this only
 * enforces the auction rules. A reveal is valid iff it opens an accepted sealed
 * bid and clears the reserve. Among valid reveals one is kept per nullifier
 * (earliest-sealed wins), the highest amount wins (ties broken by earliest
 * sealed bid), and the clearing price follows the pricing rule. With no valid
 * reveals every winner/price field is null.
 */
export function resolveAuction(
  auction: Auction,
  bids: SealedBidRecord[],
  reveals: VerifiedReveal[],
): AuctionOutcome {
  const valid: RevealMatch[] = reveals
    .map((reveal) => ({ reveal, bid: bids.find((b) => b.commitment === reveal.commitment) }))
    .filter(
      (entry): entry is RevealMatch =>
        entry.bid !== undefined && entry.reveal.amount >= auction.reservePrice,
    );

  if (valid.length === 0) {
    return {
      auctionId: auction.id,
      winnerCommitment: null,
      winnerBinding: null,
      winningBid: null,
      clearingPrice: null,
      sealedCount: bids.length,
      validRevealCount: 0,
    };
  }

  // One admissible bid per bidder: keep the earliest-sealed reveal per nullifier.
  const byNullifier = new Map<string, RevealMatch>();
  for (const entry of valid) {
    const seen = byNullifier.get(entry.bid.nullifier);
    if (!seen || Date.parse(entry.bid.submittedAt) < Date.parse(seen.bid.submittedAt)) {
      byNullifier.set(entry.bid.nullifier, entry);
    }
  }
  const candidates = [...byNullifier.values()];

  // Winner: highest amount, ties broken by the earliest sealed bid.
  const winner = candidates.reduce((best, entry) => {
    if (entry.reveal.amount !== best.reveal.amount) {
      return entry.reveal.amount > best.reveal.amount ? entry : best;
    }
    return Date.parse(entry.bid.submittedAt) < Date.parse(best.bid.submittedAt) ? entry : best;
  });

  const winningBid = winner.reveal.amount;
  const distinct = [...new Set(candidates.map((c) => c.reveal.amount))].sort((a, b) => b - a);
  const clearingPrice =
    auction.pricingRule === "first-price"
      ? winningBid
      : distinct.length >= 2
        ? distinct[1]
        : auction.reservePrice;

  return {
    auctionId: auction.id,
    winnerCommitment: winner.bid.commitment,
    winnerBinding: winner.bid.bidderBinding,
    winningBid,
    clearingPrice,
    sealedCount: bids.length,
    validRevealCount: valid.length,
  };
}
