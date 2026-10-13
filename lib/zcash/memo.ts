/**
 * ZIP-302 text-memo limits.
 *
 * A shielded Zcash output carries a 512-byte memo that only its recipient can
 * read. ZecPass delivers a bid's public commitments through it — never the
 * amount, never the proof bytes (an UltraHonk proof dwarfs 512 bytes). The
 * concrete memo layouts live with their callers (lib/zcash/sealed-bid.ts); this
 * module owns only the shared size limit, because a memo that overflows is
 * truncated on chain and would silently corrupt a bid.
 */
export const MEMO_MAX_BYTES = 512;

/** Byte length of a memo once UTF-8 encoded (not its character count). */
export function memoByteLength(memo: string): number {
  return new TextEncoder().encode(memo).length;
}

/** Whether a memo fits in one shielded output's memo field. */
export function fitsInMemo(memo: string): boolean {
  return memoByteLength(memo) <= MEMO_MAX_BYTES;
}
