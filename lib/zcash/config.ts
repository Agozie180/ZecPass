/**
 * Zcash network registry.
 *
 * ZecPass only ever addresses shielded recipients, so a "network" here is the
 * set of human-readable address prefixes it accepts plus a display name. One
 * registry drives both the active-network selection and address validation
 * (lib/zcash/address.ts), so the two can never drift out of sync.
 */
export type ZcashNetworkId = "mainnet" | "testnet";

export type NetworkProfile = {
  id: ZcashNetworkId;
  name: string;
  /** Bech32m human-readable prefix of a Unified Address (ZIP-316). */
  unifiedHrp: string;
  /** Bech32 human-readable prefix of a Sapling address. */
  saplingHrp: string;
};

export const NETWORKS: Record<ZcashNetworkId, NetworkProfile> = {
  mainnet: { id: "mainnet", name: "Mainnet", unifiedHrp: "u", saplingHrp: "zs" },
  testnet: { id: "testnet", name: "Testnet", unifiedHrp: "utest", saplingHrp: "ztestsapling" },
};

/** Testnet unless explicitly set to mainnet, so a demo never touches real funds. */
export const ZCASH_NETWORK: NetworkProfile =
  process.env.NEXT_PUBLIC_ZCASH_NETWORK === "mainnet" ? NETWORKS.mainnet : NETWORKS.testnet;

/** 1 ZEC = 10^8 zatoshis. */
export const ZATOSHIS_PER_ZEC = 100_000_000;

/** Default amount a bid-delivery or settlement request carries: 0.0001 ZEC. */
export const DEFAULT_REQUEST_ZAT = 10_000;

/** Abbreviate a long opaque id or hash as `head…tail` for display. */
export function shortId(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}
