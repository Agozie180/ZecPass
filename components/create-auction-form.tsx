"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { parseZcashAddress } from "@/lib/zcash/address";
import { ZCASH_NETWORK } from "@/lib/zcash/config";

const DEFAULT_OPEN = "2026-10-12T09:00";
const DEFAULT_CLOSE = "2026-10-20T17:00";

/** Create an auction. The reserve, the rule and the timing are public by design. */
export function CreateAuctionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("Sealed note, 10 ZEC reserve");
  const [description, setDescription] = useState("A private sale. Bidders prove their bid clears the reserve without revealing it.");
  const [reservePrice, setReservePrice] = useState(10);
  const [currency, setCurrency] = useState("ZEC");
  const [pricingRule, setPricingRule] = useState<"first-price" | "vickrey">("vickrey");
  const [bidOpensAt, setBidOpensAt] = useState(DEFAULT_OPEN);
  const [bidClosesAt, setBidClosesAt] = useState(DEFAULT_CLOSE);
  const [sellerAddress, setSellerAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addressCheck = useMemo(
    () => (sellerAddress.trim() ? parseZcashAddress(sellerAddress, ZCASH_NETWORK.id) : null),
    [sellerAddress],
  );
  const validAddress = addressCheck?.ok === true;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!validAddress) throw new Error("Enter a valid shielded seller address.");
      const res = await fetch("/api/auctions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          reservePrice,
          currency,
          pricingRule,
          bidOpensAt: new Date(bidOpensAt).toISOString(),
          bidClosesAt: new Date(bidClosesAt).toISOString(),
          sellerAddress: sellerAddress.trim(),
        }),
      });
      const data = (await res.json()) as { auction?: { id: string }; error?: string };
      if (!res.ok || !data.auction) throw new Error(data.error ?? "Could not create the auction.");
      router.push(`/auctions/${encodeURIComponent(data.auction.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the auction.");
      setBusy(false);
    }
  };

  return (
    <form className="create-form" onSubmit={submit}>
      <label>
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
      </label>
      <label>
        <span>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={280} />
      </label>

      <div className="create-row">
        <label>
          <span>Reserve price</span>
          <input
            type="number" min={1} step={1} value={reservePrice}
            onChange={(e) => setReservePrice(Number(e.target.value))} required
          />
        </label>
        <label>
          <span>Currency</span>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={12} />
        </label>
        <label>
          <span>Pricing rule</span>
          <select value={pricingRule} onChange={(e) => setPricingRule(e.target.value as "first-price" | "vickrey")}>
            <option value="vickrey">Second-price (Vickrey)</option>
            <option value="first-price">First-price</option>
          </select>
        </label>
      </div>

      <div className="create-row">
        <label>
          <span>Bidding opens</span>
          <input type="datetime-local" value={bidOpensAt} onChange={(e) => setBidOpensAt(e.target.value)} required />
        </label>
        <label>
          <span>Bidding closes</span>
          <input type="datetime-local" value={bidClosesAt} onChange={(e) => setBidClosesAt(e.target.value)} required />
        </label>
      </div>

      <label>
        <span>Seller shielded address ({ZCASH_NETWORK.name.toLowerCase()})</span>
        <input
          value={sellerAddress}
          onChange={(e) => setSellerAddress(e.target.value)}
          placeholder={ZCASH_NETWORK.id === "mainnet" ? "u1… or zs1…" : "utest1… or ztestsapling1…"}
          spellCheck={false}
          autoComplete="off"
          required
        />
      </label>
      {addressCheck && !addressCheck.ok && <p className="warn">{addressCheck.reason}</p>}

      <div className="create-foot">
        <p><ShieldCheck size={14} /> The reserve and timing are public. The bids never are.</p>
        <button type="submit" disabled={busy || !validAddress}>
          {busy ? <><LoaderCircle className="spin" size={15} /> Creating…</> : <>Open the auction <ArrowRight size={16} /></>}
        </button>
      </div>
      {error && <p className="warn">{error}</p>}
    </form>
  );
}
