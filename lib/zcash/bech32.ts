import { bech32, bech32m } from "@scure/base";

/**
 * Bech32 / Bech32m checksum verification over the audited @scure/base codec.
 *
 * Zcash uses Bech32 for Sapling addresses and Bech32m for Unified Addresses
 * (ZIP-316). We only confirm the structure and checksum and report which variant
 * matched; the payload is never decoded. The BIP-173 length cap is disabled
 * because a Unified Address is far longer than 90 characters.
 */
export type Bech32Variant = "bech32" | "bech32m";
export type Bech32Decoded = { hrp: string; variant: Bech32Variant; wordCount: number };

const CODECS = { bech32, bech32m } as const;

/** Decode under whichever checksum variant matches, or null if neither does. */
export function decodeBech32(input: string): Bech32Decoded | null {
  for (const variant of ["bech32m", "bech32"] as const) {
    try {
      const { prefix, words } = CODECS[variant].decode(input as `${string}1${string}`, false);
      return { hrp: prefix, variant, wordCount: words.length };
    } catch {
      // Not this variant — fall through and try the other checksum.
    }
  }
  return null;
}

/** Encode 5-bit `words` under a chosen variant. Used to build test fixtures. */
export function encodeBech32(hrp: string, words: number[], variant: Bech32Variant): string {
  return CODECS[variant].encode(hrp, words, false);
}
