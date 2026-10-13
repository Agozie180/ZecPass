/**
 * Circuit-agnostic proof helpers.
 *
 * These are the small pieces every proof module shares: the proof system label,
 * SHA-256 and hex/bytes conversion, and the hashing of a string into a non-zero
 * BN254 field element. Nothing here mentions a particular circuit or business
 * concept, so the auction proofs (and any future circuit) can import it without
 * pulling in unrelated code.
 */
export const PROOF_SYSTEM = "Noir + UltraHonk" as const;

const BN254_FIELD_MODULUS = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Hex input must have an even length.");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function concatFieldBytes(fields: string[]): Uint8Array {
  const out = new Uint8Array(fields.length * 32);
  fields.forEach((field, index) => {
    const bytes = hexToBytes(field);
    if (bytes.length !== 32) throw new Error("UltraHonk public inputs must be 32-byte fields.");
    out.set(bytes, index * 32);
  });
  return out;
}

/** Hash a string into a non-zero BN254 field element, rendered as 32 hex bytes. */
export async function fieldHexFromString(input: string): Promise<string> {
  const digest = await sha256Hex(input);
  const value = BigInt(`0x${digest}`) % BN254_FIELD_MODULUS;
  const nonZero = value === BigInt(0) ? BigInt(1) : value;
  return nonZero.toString(16).padStart(64, "0");
}

/** Render a field hex string with the `0x` prefix the circuit inputs expect. */
export function toCircuitField(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}

/** Canonical field form: strip any `0x` prefix and leading zeros, lowercased. */
export function normalizeField(value: string): string {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  return clean.toLowerCase().replace(/^0+/, "") || "0";
}
