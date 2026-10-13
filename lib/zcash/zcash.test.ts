import { describe, expect, it } from "vitest";
import { decodeBech32, encodeBech32 } from "./bech32";
import { parseZcashAddress } from "./address";
import { NETWORKS } from "./config";
import { MEMO_MAX_BYTES, fitsInMemo, memoByteLength } from "./memo";
import { buildPaymentUri, formatZec, toBase64Url } from "./zip321";

// Synthetic, checksum-valid addresses (controlled by no one). They exercise the
// validator without being real receivers. The word pattern is arbitrary.
const words = (length: number) => Array.from({ length }, (_, i) => (i * 7 + 3) % 32);
const UA_MAIN = encodeBech32(NETWORKS.mainnet.unifiedHrp, words(100), "bech32m");
const UA_TEST = encodeBech32(NETWORKS.testnet.unifiedHrp, words(100), "bech32m");
const SAPLING_MAIN = encodeBech32(NETWORKS.mainnet.saplingHrp, words(52), "bech32");
const SAPLING_TEST = encodeBech32(NETWORKS.testnet.saplingHrp, words(52), "bech32");

describe("bech32", () => {
  it("recognises the BIP-173 and BIP-350 reference vectors", () => {
    expect(decodeBech32("A12UEL5L")?.variant).toBe("bech32");
    expect(decodeBech32("A1LQFN3A")?.variant).toBe("bech32m");
  });

  it("rejects a corrupted checksum and mixed case", () => {
    expect(decodeBech32("A12UEL5M")).toBeNull();
    expect(decodeBech32("A1lqfn3A")).toBeNull();
  });

  it("round-trips an encoded prefix and word count", () => {
    expect(decodeBech32(UA_TEST)).toEqual({ hrp: "utest", variant: "bech32m", wordCount: 100 });
    expect(decodeBech32(SAPLING_MAIN)).toEqual({ hrp: "zs", variant: "bech32", wordCount: 52 });
  });
});

describe("parseZcashAddress", () => {
  it("accepts unified and Sapling addresses on both networks", () => {
    expect(parseZcashAddress(UA_MAIN)).toEqual({ ok: true, kind: "unified", network: "mainnet" });
    expect(parseZcashAddress(UA_TEST)).toEqual({ ok: true, kind: "unified", network: "testnet" });
    expect(parseZcashAddress(SAPLING_MAIN)).toEqual({ ok: true, kind: "sapling", network: "mainnet" });
    expect(parseZcashAddress(SAPLING_TEST)).toEqual({ ok: true, kind: "sapling", network: "testnet" });
  });

  it("trims surrounding whitespace", () => {
    expect(parseZcashAddress(`  ${UA_TEST}  `).ok).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(parseZcashAddress("   ").ok).toBe(false);
  });

  it("rejects transparent addresses with a privacy reason", () => {
    const res = parseZcashAddress("t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/public/i);
  });

  it("rejects a mistyped address", () => {
    const typo = `${UA_TEST.slice(0, -2)}${UA_TEST.endsWith("qq") ? "pp" : "qq"}`;
    expect(parseZcashAddress(typo).ok).toBe(false);
  });

  it("rejects a checksum variant that does not match the prefix", () => {
    const unifiedButBech32 = encodeBech32("u", words(100), "bech32");
    expect(parseZcashAddress(unifiedButBech32).ok).toBe(false);
  });

  it("rejects the wrong network when one is expected", () => {
    expect(parseZcashAddress(UA_MAIN, "testnet").ok).toBe(false);
    expect(parseZcashAddress(UA_TEST, "testnet").ok).toBe(true);
  });

  it("rejects an unknown prefix", () => {
    expect(parseZcashAddress(encodeBech32("btc", words(40), "bech32")).ok).toBe(false);
  });
});

describe("memo limits", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(memoByteLength("abc")).toBe(3);
    expect(memoByteLength("€")).toBe(3); // one character, three bytes
    expect(memoByteLength("🔒")).toBe(4);
  });

  it("fits exactly at the limit and not one byte over", () => {
    expect(MEMO_MAX_BYTES).toBe(512);
    expect(fitsInMemo("a".repeat(512))).toBe(true);
    expect(fitsInMemo("a".repeat(513))).toBe(false);
  });
});

describe("ZIP-321 payment request", () => {
  it("formats zatoshis as ZEC without float error", () => {
    expect(formatZec(10_000)).toBe("0.0001");
    expect(formatZec(100_000_000)).toBe("1");
    expect(formatZec(123_456_789)).toBe("1.23456789");
    expect(() => formatZec(0)).toThrow();
    expect(() => formatZec(1.5)).toThrow();
  });

  it("encodes base64url without padding", () => {
    expect(toBase64Url(new Uint8Array([251, 255, 254]))).toBe("-__-");
    expect(toBase64Url(new TextEncoder().encode("ab"))).toBe("YWI");
  });

  it("builds a zcash: URI carrying the memo and label", () => {
    const uri = buildPaymentUri({ address: UA_TEST, amountZat: 10_000, memo: "ZECBID1|demo", label: "Sealed bid" });
    expect(uri.startsWith(`zcash:${UA_TEST}?amount=0.0001&memo=`)).toBe(true);
    expect(uri).toContain("&label=Sealed%20bid");
    const memoParam = uri.split("memo=")[1].split("&")[0];
    expect(memoParam).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
  });

  it("refuses an invalid address and an oversized memo", () => {
    expect(() => buildPaymentUri({ address: "nope", amountZat: 10_000, memo: "x" })).toThrow();
    expect(() => buildPaymentUri({ address: UA_TEST, amountZat: 10_000, memo: "a".repeat(513) })).toThrow(/512/);
  });
});
