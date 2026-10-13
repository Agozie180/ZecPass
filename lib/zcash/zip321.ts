import { parseZcashAddress } from "@/lib/zcash/address";
import { fitsInMemo } from "@/lib/zcash/memo";
import { ZATOSHIS_PER_ZEC } from "@/lib/zcash/config";

/**
 * ZIP-321 payment requests: a `zcash:` URI a wallet opens to send a shielded
 * payment with a memo. ZecPass uses it to deliver sealed bids to the auctioneer
 * and to settle with the seller.
 */

/** Base64url (RFC 4648 §5), unpadded — the encoding ZIP-321 uses for `memo`. */
export function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Render a whole number of zatoshis as a decimal ZEC string, without float error. */
export function formatZec(zatoshis: number): string {
  if (!Number.isInteger(zatoshis) || zatoshis <= 0) {
    throw new Error("Amount must be a positive whole number of zatoshis.");
  }
  const whole = Math.floor(zatoshis / ZATOSHIS_PER_ZEC);
  const fraction = String(zatoshis % ZATOSHIS_PER_ZEC).padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export type PaymentRequest = {
  address: string;
  amountZat: number;
  memo: string;
  label?: string;
};

/** Build `zcash:<address>?amount=…&memo=…[&label=…]`, validating the address and memo. */
export function buildPaymentUri(request: PaymentRequest): string {
  const address = request.address.trim();
  const check = parseZcashAddress(address);
  if (!check.ok) throw new Error(check.reason);
  if (!fitsInMemo(request.memo)) throw new Error("Memo exceeds the 512 byte Zcash memo limit.");

  const params: Array<[string, string]> = [
    ["amount", formatZec(request.amountZat)],
    ["memo", toBase64Url(new TextEncoder().encode(request.memo))],
  ];
  if (request.label) params.push(["label", encodeURIComponent(request.label)]);

  return `zcash:${address}?${params.map(([key, value]) => `${key}=${value}`).join("&")}`;
}
