import { describe, it, expect } from "vitest";
import { currencyField } from "@/lib/proof/auction-proofs";
import { normalizeField } from "@/lib/proof/primitives";
import { parseZcashAddress } from "@/lib/zcash/address";
import { NETWORKS, type ZcashNetworkId } from "@/lib/zcash/config";
import testnetSeed from "./seed-data.testnet.json";

/**
 * Each committed seed must belong to its network. The network is mixed into
 * every proof's currency tag, so a seed generated for the wrong network would
 * deploy cleanly and then show "proof invalid" on every bid. These checks catch
 * that before it ships, without running the prover.
 *
 * The mainnet seed carries the operator's own seller address and is generated at
 * deploy time, so these checks run only when it is present.
 */

type SeedAuction = {
  id: string;
  sellerAddress: string;
  sealedBids: { publicInputs: string[] }[];
  reveals: { publicInputs: string[] }[];
};

const mainnetSeed: { auctions: SeedAuction[] } | null = await import("./seed-data.mainnet.json")
  .then((m) => m.default as { auctions: SeedAuction[] })
  .catch(() => null);

const SEEDS: Partial<Record<ZcashNetworkId, { auctions: SeedAuction[] }>> = {
  mainnet: mainnetSeed ?? undefined,
  testnet: testnetSeed,
};

const present = (Object.keys(NETWORKS) as ZcashNetworkId[]).filter((n) => SEEDS[n]);

it("has a seed committed for testnet", () => {
  expect(SEEDS.testnet?.auctions.length).toBeGreaterThan(0);
});

describe.each(present)("%s seed", (network) => {
  const { auctions } = SEEDS[network]!;

  it("has auctions with sealed bids", () => {
    expect(auctions.length).toBeGreaterThan(0);
    expect(auctions.every((a) => a.sealedBids.length > 0)).toBe(true);
  });

  it("tags every proof with this network's currency field", async () => {
    for (const auction of auctions) {
      const currency = normalizeField(await currencyField(auction.id, network));
      // sealed_bid public inputs open with `currency`; open_bid's are `bid, currency, …`.
      for (const bid of auction.sealedBids) expect(normalizeField(bid.publicInputs[0])).toBe(currency);
      for (const reveal of auction.reveals) expect(normalizeField(reveal.publicInputs[1])).toBe(currency);
    }
  });

  it("names a shielded seller address on this network", () => {
    for (const auction of auctions) {
      expect(parseZcashAddress(auction.sellerAddress, network)).toMatchObject({ ok: true, network });
    }
  });
});
