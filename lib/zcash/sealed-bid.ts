import { parseZcashAddress } from "@/lib/zcash/address";
import { MEMO_MAX_BYTES, memoByteLength } from "@/lib/zcash/memo";
import { buildPaymentUri, formatZec } from "@/lib/zcash/zip321";

/**
 * Sealed-bid auction delivery over shielded Zcash transactions (ZIP-302 memos).
 *
 * A bid is delivered to the auctioneer inside a shielded transaction's 512 byte
 * memo, so the bidder stays private: only the auctioneer can read it. The memo
 * carries public commitments (the bid commitment, bidder binding, nullifier and
 * a proof commitment), never the proof bytes and never private inputs. The
 * winner later settles by a shielded payment to the seller carrying a settlement
 * memo. Both memos stay inside the 512 byte limit `memo.ts` enforces.
 */
export const SEALED_BID_MEMO_PREFIX = "ZECBID1";

export type SealedBidMemoFields = {
  auctionId: string;
  commitment: string;
  bidderBinding: string;
  nullifier: string;
  proofCommitment: string;
};

const SEALED_BID_FIELD_ORDER: (keyof SealedBidMemoFields)[] = [
  "auctionId",
  "commitment",
  "bidderBinding",
  "nullifier",
  "proofCommitment",
];

export function buildSealedBidMemo(fields: SealedBidMemoFields): string {
  for (const key of SEALED_BID_FIELD_ORDER) {
    const value = fields[key];
    if (!value || value.includes("|")) throw new Error(`Memo field "${key}" is empty or contains "|".`);
  }
  const memo = [SEALED_BID_MEMO_PREFIX, ...SEALED_BID_FIELD_ORDER.map((key) => fields[key])].join("|");
  if (memoByteLength(memo) > MEMO_MAX_BYTES) throw new Error("Sealed bid memo exceeds the 512 byte Zcash memo limit.");
  return memo;
}

export function parseSealedBidMemo(memo: string): SealedBidMemoFields | null {
  const parts = memo.replace(/\0+$/, "").split("|");
  if (parts.length !== SEALED_BID_FIELD_ORDER.length + 1 || parts[0] !== SEALED_BID_MEMO_PREFIX) return null;
  if (parts.some((part) => part.length === 0)) return null;
  const fields = {} as SealedBidMemoFields;
  SEALED_BID_FIELD_ORDER.forEach((key, index) => {
    fields[key] = parts[index + 1];
  });
  return fields;
}

/**
 * Deliver a sealed bid as a shielded ZIP-321 request to the auctioneer:
 * `zcash:<auctioneer>?amount=<ZEC>&memo=<base64url>&label=Sealed%20bid`.
 *
 * The address must be shielded (unified or Sapling); transparent or invalid
 * addresses are rejected with the validator's own reason. `amountZat` is a
 * nominal "bid envelope" amount, 0.0001 ZEC by default.
 */
export function buildBidDeliveryUri(args: {
  auctioneerAddress: string;
  memo: string;
  amountZat?: number;
  expectedNetwork?: "testnet" | "mainnet";
}): string {
  const check = parseZcashAddress(args.auctioneerAddress, args.expectedNetwork);
  if (!check.ok) throw new Error(check.reason);
  return buildPaymentUri({
    address: args.auctioneerAddress,
    amountZat: args.amountZat ?? 10_000,
    memo: args.memo,
    label: "Sealed bid",
  });
}

/**
 * Settlement memo carried by the winner's shielded payment to the seller. It
 * names the auction, the winning bid commitment and the clearing price (a
 * decimal ZEC string produced by `formatZec`).
 */
export const SETTLE_MEMO_PREFIX = "ZECSETTLE1";

export type SettlementMemoFields = {
  auctionId: string;
  winnerCommitment: string;
  clearingPrice: string;
};

const SETTLEMENT_FIELD_ORDER: (keyof SettlementMemoFields)[] = [
  "auctionId",
  "winnerCommitment",
  "clearingPrice",
];

export function buildSettlementMemo(fields: SettlementMemoFields): string {
  for (const key of SETTLEMENT_FIELD_ORDER) {
    const value = fields[key];
    if (!value || value.includes("|")) throw new Error(`Memo field "${key}" is empty or contains "|".`);
  }
  const memo = [SETTLE_MEMO_PREFIX, ...SETTLEMENT_FIELD_ORDER.map((key) => fields[key])].join("|");
  if (memoByteLength(memo) > MEMO_MAX_BYTES) throw new Error("Settlement memo exceeds the 512 byte Zcash memo limit.");
  return memo;
}

export function parseSettlementMemo(memo: string): SettlementMemoFields | null {
  const parts = memo.replace(/\0+$/, "").split("|");
  if (parts.length !== SETTLEMENT_FIELD_ORDER.length + 1 || parts[0] !== SETTLE_MEMO_PREFIX) return null;
  if (parts.some((part) => part.length === 0)) return null;
  const fields = {} as SettlementMemoFields;
  SETTLEMENT_FIELD_ORDER.forEach((key, index) => {
    fields[key] = parts[index + 1];
  });
  return fields;
}

/**
 * Settle a won auction with a shielded ZIP-321 payment to the seller for the
 * clearing price, carrying a settlement memo:
 * `zcash:<seller>?amount=<ZEC>&memo=<base64url>&label=Auction%20settlement`.
 *
 * The seller address must be shielded; transparent or invalid addresses are
 * rejected with the validator's own reason.
 */
export function buildSettlementUri(args: {
  sellerAddress: string;
  clearingPriceZat: number;
  auctionId: string;
  winnerCommitment: string;
  expectedNetwork?: "testnet" | "mainnet";
}): string {
  const check = parseZcashAddress(args.sellerAddress, args.expectedNetwork);
  if (!check.ok) throw new Error(check.reason);
  const memo = buildSettlementMemo({
    auctionId: args.auctionId,
    winnerCommitment: args.winnerCommitment,
    clearingPrice: formatZec(args.clearingPriceZat),
  });
  return buildPaymentUri({
    address: args.sellerAddress,
    amountZat: args.clearingPriceZat,
    memo,
    label: "Auction settlement",
  });
}
