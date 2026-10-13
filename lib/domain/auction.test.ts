import { describe, expect, it } from "vitest";
import {
  acceptSealedBid,
  createAuction,
  isBiddingOpen,
  resolveAuction,
  type Auction,
  type SealedBidRecord,
  type VerifiedReveal,
} from "./auction";

/**
 * The auction price is public and the rules are enforced here; the bidders stay
 * private and reveals are trusted to open their commitment (proven elsewhere).
 * These tests pin the rule enforcement: validation, the bidding window, sealed
 * admission (uniqueness + no mutation), and settlement for both pricing rules.
 */

const OPENS = "2026-10-10T00:00:00.000Z";
const CLOSES = "2026-10-20T00:00:00.000Z";

const baseInput: Omit<Auction, "id"> = {
  title: "Rare Shielded Note",
  description: "A sealed-bid sale.",
  reservePrice: 100,
  currency: "ZEC",
  pricingRule: "first-price",
  bidOpensAt: OPENS,
  bidClosesAt: CLOSES,
  sellerAddress: "zs1seller",
};

const sealedBid = (over: Partial<SealedBidRecord> = {}): SealedBidRecord => ({
  auctionId: "auction-1",
  commitment: "0xcommit",
  bidderBinding: "0xbind",
  nullifier: "0xnull",
  proofCommitment: "0xproof",
  submittedAt: "2026-10-11T00:00:00.000Z",
  ...over,
});

const reveal = (over: Partial<VerifiedReveal> = {}): VerifiedReveal => ({
  auctionId: "auction-1",
  commitment: "0xcommit",
  amount: 150,
  bidderBinding: "0xbind",
  ...over,
});

describe("createAuction", () => {
  it("rejects a non-positive reserve price", () => {
    expect(() => createAuction({ ...baseInput, reservePrice: 0 })).toThrow(RangeError);
    expect(() => createAuction({ ...baseInput, reservePrice: -5 })).toThrow(RangeError);
  });

  it("rejects a non-integer reserve price", () => {
    expect(() => createAuction({ ...baseInput, reservePrice: 10.5 })).toThrow(RangeError);
  });

  it("rejects a close time at or before the open time", () => {
    expect(() => createAuction({ ...baseInput, bidClosesAt: OPENS })).toThrow(RangeError);
    expect(() => createAuction({ ...baseInput, bidClosesAt: "2026-10-09T00:00:00.000Z" })).toThrow(
      RangeError,
    );
  });

  it("rejects an unknown pricing rule and an empty title/seller", () => {
    expect(() =>
      createAuction({ ...baseInput, pricingRule: "english" as unknown as Auction["pricingRule"] }),
    ).toThrow(RangeError);
    expect(() => createAuction({ ...baseInput, title: "   " })).toThrow(RangeError);
    expect(() => createAuction({ ...baseInput, sellerAddress: "" })).toThrow(RangeError);
  });

  it("derives a stable, deterministic id from title + timing when omitted", () => {
    const a = createAuction(baseInput);
    const b = createAuction(baseInput);
    expect(a.id).toBe(b.id);
    expect(a.id.startsWith("rare-shielded-note-")).toBe(true);
  });

  it("keeps an explicit id when provided", () => {
    expect(createAuction({ ...baseInput, id: "fixed-id" }).id).toBe("fixed-id");
  });
});

describe("isBiddingOpen", () => {
  const auction = createAuction(baseInput);

  it("is closed before the open time", () => {
    expect(isBiddingOpen(auction, "2026-10-09T23:59:59.000Z")).toBe(false);
  });

  it("is open at the open instant and inside the window", () => {
    expect(isBiddingOpen(auction, OPENS)).toBe(true);
    expect(isBiddingOpen(auction, "2026-10-15T12:00:00.000Z")).toBe(true);
  });

  it("is closed at the close instant (end-exclusive) and after", () => {
    expect(isBiddingOpen(auction, CLOSES)).toBe(false);
    expect(isBiddingOpen(auction, "2026-10-21T00:00:00.000Z")).toBe(false);
  });
});

describe("acceptSealedBid", () => {
  const NOW = "2026-10-12T00:00:00.000Z";

  it("admits a bid and returns a new array without mutating the input", () => {
    const existing: SealedBidRecord[] = [];
    const result = acceptSealedBid(existing, sealedBid(), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bids).toHaveLength(1);
      expect(result.bids).not.toBe(existing);
    }
    expect(existing).toHaveLength(0);
  });

  it("rejects a bid submitted after now as closed", () => {
    const result = acceptSealedBid([], sealedBid({ submittedAt: "2026-10-13T00:00:00.000Z" }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Bidding is closed.");
  });

  it("rejects a duplicate nullifier", () => {
    const existing = [sealedBid()];
    const result = acceptSealedBid(existing, sealedBid({ commitment: "0xother" }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("One bid per bidder per auction.");
  });

  it("rejects a duplicate commitment", () => {
    const existing = [sealedBid()];
    const result = acceptSealedBid(existing, sealedBid({ nullifier: "0xother" }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Duplicate bid commitment.");
  });
});

describe("resolveAuction", () => {
  const auction = createAuction(baseInput); // first-price, reserve 100
  const vickrey = createAuction({ ...baseInput, pricingRule: "vickrey" });

  const bidA = sealedBid({
    commitment: "0xA",
    nullifier: "0xNA",
    bidderBinding: "0xBA",
    submittedAt: "2026-10-11T00:00:00.000Z",
  });
  const bidB = sealedBid({
    commitment: "0xB",
    nullifier: "0xNB",
    bidderBinding: "0xBB",
    submittedAt: "2026-10-11T01:00:00.000Z",
  });
  const bidC = sealedBid({
    commitment: "0xC",
    nullifier: "0xNC",
    bidderBinding: "0xBC",
    submittedAt: "2026-10-11T02:00:00.000Z",
  });

  it("picks the highest bid as the first-price winner and clears at that bid", () => {
    const outcome = resolveAuction(
      auction,
      [bidA, bidB],
      [reveal({ commitment: "0xA", amount: 150 }), reveal({ commitment: "0xB", amount: 200 })],
    );
    expect(outcome.winningBid).toBe(200);
    expect(outcome.clearingPrice).toBe(200);
    expect(outcome.winnerCommitment).toBe("0xB");
    expect(outcome.winnerBinding).toBe("0xBB");
    expect(outcome.sealedCount).toBe(2);
    expect(outcome.validRevealCount).toBe(2);
  });

  it("clears a Vickrey auction at the second-highest distinct amount", () => {
    const outcome = resolveAuction(
      vickrey,
      [bidA, bidB, bidC],
      [
        reveal({ commitment: "0xA", amount: 200 }),
        reveal({ commitment: "0xB", amount: 150 }),
        reveal({ commitment: "0xC", amount: 120 }),
      ],
    );
    expect(outcome.winningBid).toBe(200);
    expect(outcome.clearingPrice).toBe(150);
    expect(outcome.winnerCommitment).toBe("0xA");
  });

  it("clears a single-bid Vickrey auction at the reserve price", () => {
    const outcome = resolveAuction(vickrey, [bidA], [reveal({ commitment: "0xA", amount: 150 })]);
    expect(outcome.winningBid).toBe(150);
    expect(outcome.clearingPrice).toBe(100);
    expect(outcome.validRevealCount).toBe(1);
  });

  it("clears Vickrey at the reserve when only one distinct amount is bid", () => {
    const outcome = resolveAuction(
      vickrey,
      [bidA, bidB],
      [reveal({ commitment: "0xA", amount: 200 }), reveal({ commitment: "0xB", amount: 200 })],
    );
    expect(outcome.winningBid).toBe(200);
    expect(outcome.clearingPrice).toBe(100); // only one distinct valid amount => reserve
    expect(outcome.winnerCommitment).toBe("0xA"); // tie broken by earliest sealed bid
  });

  it("ignores reveals below the reserve and reveals with no matching sealed bid", () => {
    const outcome = resolveAuction(
      auction,
      [bidA, bidC],
      [
        reveal({ commitment: "0xA", amount: 150 }),
        reveal({ commitment: "0xC", amount: 50 }), // below reserve
        reveal({ commitment: "0xUNKNOWN", amount: 999 }), // no sealed bid
      ],
    );
    expect(outcome.winningBid).toBe(150);
    expect(outcome.winnerCommitment).toBe("0xA");
    expect(outcome.sealedCount).toBe(2);
    expect(outcome.validRevealCount).toBe(1);
  });

  it("breaks a tie by the earliest sealed bid, independent of reveal order", () => {
    const outcome = resolveAuction(
      auction,
      [bidA, bidB],
      // equal amounts, bidB's reveal listed first; bidA was sealed earlier
      [reveal({ commitment: "0xB", amount: 150 }), reveal({ commitment: "0xA", amount: 150 })],
    );
    expect(outcome.winnerCommitment).toBe("0xA");
    expect(outcome.winnerBinding).toBe("0xBA");
  });

  it("returns a null outcome when there are no valid reveals", () => {
    const outcome = resolveAuction(auction, [bidA], []);
    expect(outcome.winnerCommitment).toBeNull();
    expect(outcome.winnerBinding).toBeNull();
    expect(outcome.winningBid).toBeNull();
    expect(outcome.clearingPrice).toBeNull();
    expect(outcome.sealedCount).toBe(1);
    expect(outcome.validRevealCount).toBe(0);
  });
});
