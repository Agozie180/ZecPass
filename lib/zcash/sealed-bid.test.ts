import { describe, expect, it } from "vitest";
import { encodeBech32 } from "./bech32";
import { MEMO_MAX_BYTES, memoByteLength } from "./memo";
import {
  buildBidDeliveryUri,
  buildSealedBidMemo,
  buildSettlementMemo,
  buildSettlementUri,
  parseSealedBidMemo,
  parseSettlementMemo,
  SEALED_BID_MEMO_PREFIX,
  SETTLE_MEMO_PREFIX,
} from "./sealed-bid";

// Checksum-valid but synthetic addresses (not controlled by anyone). They exercise
// the validator; they are not real Zcash receivers.
const payload = (length: number) => Array.from({ length }, (_, i) => (i * 7 + 3) % 32);
const UA_TEST = encodeBech32("utest", payload(100), "bech32m");
const SAPLING_TEST = encodeBech32("ztestsapling", payload(52), "bech32");
const TRANSPARENT = "t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs";

const BID_FIELDS = {
  auctionId: "AUC-2026-0007",
  commitment: "a".repeat(64),
  bidderBinding: "b".repeat(64),
  nullifier: "c".repeat(64),
  proofCommitment: "d".repeat(64),
};

const SETTLE_FIELDS = {
  auctionId: "AUC-2026-0007",
  winnerCommitment: "a".repeat(64),
  clearingPrice: "1.5",
};

describe("sealed-bid memo", () => {
  it("round-trips and stays inside the 512 byte memo field", () => {
    const memo = buildSealedBidMemo(BID_FIELDS);
    expect(memo.startsWith(`${SEALED_BID_MEMO_PREFIX}|`)).toBe(true);
    expect(memoByteLength(memo)).toBeLessThanOrEqual(MEMO_MAX_BYTES);
    expect(parseSealedBidMemo(memo)).toEqual(BID_FIELDS);
  });

  it("rejects fields that are empty or would corrupt the delimiter", () => {
    expect(() => buildSealedBidMemo({ ...BID_FIELDS, commitment: "a|b" })).toThrow();
    expect(() => buildSealedBidMemo({ ...BID_FIELDS, auctionId: "" })).toThrow();
  });

  it("rejects a memo that would exceed the 512 byte limit", () => {
    expect(() => buildSealedBidMemo({ ...BID_FIELDS, commitment: "x".repeat(512) })).toThrow();
  });

  it("ignores trailing zero padding added by wallets", () => {
    expect(parseSealedBidMemo(`${buildSealedBidMemo(BID_FIELDS)}\0\0\0`)).toEqual(BID_FIELDS);
  });

  it("returns null for unrelated memos", () => {
    expect(parseSealedBidMemo("hello")).toBeNull();
    expect(parseSealedBidMemo("ZECBID1|only|three|parts")).toBeNull();
    expect(parseSealedBidMemo(buildSettlementMemo(SETTLE_FIELDS))).toBeNull();
  });
});

describe("bid delivery request", () => {
  it("builds a zcash: URI carrying the bid memo to a shielded auctioneer", () => {
    const memo = buildSealedBidMemo(BID_FIELDS);
    const uri = buildBidDeliveryUri({ auctioneerAddress: UA_TEST, memo });
    expect(uri.startsWith(`zcash:${UA_TEST}?amount=0.0001&memo=`)).toBe(true);
    expect(uri).toContain("&label=Sealed%20bid");
    const memoParam = uri.split("memo=")[1].split("&")[0];
    expect(memoParam).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("refuses to deliver to a transparent or invalid address", () => {
    const memo = buildSealedBidMemo(BID_FIELDS);
    expect(() => buildBidDeliveryUri({ auctioneerAddress: TRANSPARENT, memo })).toThrow(/public/i);
    expect(() => buildBidDeliveryUri({ auctioneerAddress: "nope", memo })).toThrow();
  });
});

describe("settlement memo", () => {
  it("round-trips and stays inside the 512 byte memo field", () => {
    const memo = buildSettlementMemo(SETTLE_FIELDS);
    expect(memo.startsWith(`${SETTLE_MEMO_PREFIX}|`)).toBe(true);
    expect(memoByteLength(memo)).toBeLessThanOrEqual(MEMO_MAX_BYTES);
    expect(parseSettlementMemo(memo)).toEqual(SETTLE_FIELDS);
  });

  it("rejects fields that are empty or would corrupt the delimiter", () => {
    expect(() => buildSettlementMemo({ ...SETTLE_FIELDS, auctionId: "a|b" })).toThrow();
    expect(() => buildSettlementMemo({ ...SETTLE_FIELDS, winnerCommitment: "" })).toThrow();
  });

  it("ignores trailing zero padding added by wallets", () => {
    expect(parseSettlementMemo(`${buildSettlementMemo(SETTLE_FIELDS)}\0\0`)).toEqual(SETTLE_FIELDS);
  });

  it("returns null for unrelated memos", () => {
    expect(parseSettlementMemo("hello")).toBeNull();
    expect(parseSettlementMemo(buildSealedBidMemo(BID_FIELDS))).toBeNull();
  });
});

describe("settlement request", () => {
  it("builds a zcash: URI to the seller for the clearing price", () => {
    const uri = buildSettlementUri({
      sellerAddress: SAPLING_TEST,
      clearingPriceZat: 150_000_000,
      auctionId: "AUC-2026-0007",
      winnerCommitment: "a".repeat(64),
    });
    expect(uri.startsWith(`zcash:${SAPLING_TEST}?amount=1.5&memo=`)).toBe(true);
    expect(uri).toContain("&label=Auction%20settlement");
    const memoParam = uri.split("memo=")[1].split("&")[0];
    expect(memoParam).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parseSettlementMemo(new TextDecoder().decode(fromBase64Url(memoParam)))).toEqual({
      auctionId: "AUC-2026-0007",
      winnerCommitment: "a".repeat(64),
      clearingPrice: "1.5",
    });
  });

  it("refuses to settle to a transparent or invalid seller address", () => {
    expect(() =>
      buildSettlementUri({
        sellerAddress: TRANSPARENT,
        clearingPriceZat: 150_000_000,
        auctionId: "AUC-2026-0007",
        winnerCommitment: "a".repeat(64),
      }),
    ).toThrow(/public/i);
  });
});

/** Decode a base64url memo param back to bytes, so a built URI can be read back. */
function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
