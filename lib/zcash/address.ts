import { decodeBech32, type Bech32Variant } from "@/lib/zcash/bech32";
import { NETWORKS, type ZcashNetworkId } from "@/lib/zcash/config";

export type ZcashAddressKind = "unified" | "sapling";

export type AddressCheck =
  | { ok: true; kind: ZcashAddressKind; network: ZcashNetworkId }
  | { ok: false; reason: string };

type Expectation = { kind: ZcashAddressKind; network: ZcashNetworkId; variant: Bech32Variant };

/**
 * Prefix -> what a well-formed address with that prefix must be, derived from
 * the single network registry so address rules and network config cannot drift.
 */
const BY_HRP: Record<string, Expectation> = Object.values(NETWORKS).reduce((map, net) => {
  map[net.unifiedHrp] = { kind: "unified", network: net.id, variant: "bech32m" };
  map[net.saplingHrp] = { kind: "sapling", network: net.id, variant: "bech32" };
  return map;
}, {} as Record<string, Expectation>);

/**
 * Check that `input` is a well-formed, shielded-capable Zcash address — Unified
 * (ZIP-316, Bech32m) or Sapling (Bech32) — by its prefix and checksum. This
 * proves the string is typo-free; it does not prove anyone controls it, and it
 * does not decode the receivers inside a Unified Address. Transparent addresses
 * are refused outright, since their payments are public.
 */
export function parseZcashAddress(input: string, expectedNetwork?: ZcashNetworkId): AddressCheck {
  const address = input.trim();
  if (!address) return { ok: false, reason: "Enter a Zcash address." };

  if (/^t[0-9a-z]/i.test(address)) {
    return { ok: false, reason: "Transparent addresses are public. Use a shielded unified (u…) or Sapling (zs…) address." };
  }

  const decoded = decodeBech32(address);
  if (!decoded) return { ok: false, reason: "That is not a valid Zcash address (bad format or checksum)." };

  const expected = BY_HRP[decoded.hrp];
  if (!expected) return { ok: false, reason: "Unrecognised address prefix. Use a unified (u…) or Sapling (zs…) address." };
  if (expected.variant !== decoded.variant) {
    return { ok: false, reason: "The address checksum does not match its prefix." };
  }
  if (expectedNetwork && expected.network !== expectedNetwork) {
    return { ok: false, reason: `That is a ${expected.network} address, but ZecPass is set to ${expectedNetwork}.` };
  }
  return { ok: true, kind: expected.kind, network: expected.network };
}
