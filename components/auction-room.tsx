"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  ArrowLeft, ArrowRight, Check, Download, Eye, Gavel, LoaderCircle,
  LockKeyhole, ShieldCheck, Stamp, Wallet, X,
} from "lucide-react";
import { isBiddingOpen, resolveAuction, type PricingRule } from "@/lib/domain/auction";
import { buildBidDeliveryUri, buildSealedBidMemo } from "@/lib/zcash/sealed-bid";
import { DEFAULT_REQUEST_ZAT, ZCASH_NETWORK, shortId } from "@/lib/zcash/config";
import { memoByteLength } from "@/lib/zcash/memo";
import { proveSealedBid, proveOpenBid, verifySealedBidProof, verifyOpenBidProof } from "@/lib/proof/auction-proofs";
import { createBidIdentity, recallBid, rememberBid } from "@/lib/proof/bidder-secret";
import type { BoardAuction } from "@/lib/board/store";

const fmt = (n: number) => n.toLocaleString("en-US");

export function AuctionRoom({ auctionId }: { auctionId: string }) {
  const [auction, setAuction] = useState<BoardAuction | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/auctions/${encodeURIComponent(auctionId)}`, { cache: "no-store" });
      const data = (await res.json()) as { auction?: BoardAuction; error?: string };
      if (!res.ok || !data.auction) throw new Error(data.error ?? "Auction not found.");
      setAuction(data.auction);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Auction not found.");
    }
  }, [auctionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <main className="shell room-shell">
        <p className="warn">{loadError}</p>
        <Link className="text-button" href="/"><ArrowLeft size={15} /> Back to the board</Link>
      </main>
    );
  }
  if (!auction) {
    return <main className="shell room-shell"><p className="board-empty"><LoaderCircle className="spin" size={15} /> Loading auction…</p></main>;
  }

  const open = isBiddingOpen(auction, new Date().toISOString());
  const revealedCommitments = new Set(auction.reveals.map((r) => r.commitment));

  return (
    <main className="shell room-shell">
      <Link className="text-button room-back" href="/"><ArrowLeft size={15} /> Board</Link>

      <header className="room-head">
        <div>
          <span className={`board-state ${open ? "open" : "closed"}`}>{open ? "Bidding open" : "Bidding closed"}</span>
          <h1>{auction.title}</h1>
          <p>{auction.description}</p>
        </div>
        <dl className="room-facts">
          <div><dt>Reserve</dt><dd>{fmt(auction.reservePrice)} {auction.currency}</dd></div>
          <div><dt>Rule</dt><dd>{auction.pricingRule === "vickrey" ? "Second-price" : "First-price"}</dd></div>
          <div><dt>Closes</dt><dd>{new Date(auction.bidClosesAt).toUTCString()}</dd></div>
        </dl>
      </header>

      <BidPanel auction={auction} open={open} onPosted={load} />

      <SealedBids auction={auction} revealedCommitments={revealedCommitments} onPosted={load} />

      <Settlement auction={auction} />
    </main>
  );
}

/* ------------------------------------------------------------------ bid panel */

function BidPanel({ auction, open, onPosted }: { auction: BoardAuction; open: boolean; onPosted: () => void }) {
  const [bid, setBid] = useState(auction.reservePrice * 2);
  const [step, setStep] = useState<"form" | "proving" | "bundle" | "done">("form");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ commitment: string; bidderBinding: string; nullifier: string; proofCommitment: string; proofHex: string; publicInputs: string[] } | null>(null);  const [memo, setMemo] = useState("");
  const [deliveryUri, setDeliveryUri] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  const maxBound = Math.max(auction.reservePrice * 100, bid + auction.reservePrice);

  const seal = async () => {
    setError(null);
    setStep("proving");
    try {
      // Each bid on the board is its own bidder, so one person can run a real
      // competitive auction. The identity is remembered locally so the bid can be
      // revealed in one click later, with no amount to retype.
      const identity = createBidIdentity();
      const proof = await proveSealedBid({
        auctionId: auction.id,
        bid,
        minReserve: auction.reservePrice,
        maxBound: Math.max(maxBound, bid),
        bidderSecret: identity.secret,
        blinding: identity.blinding,
        onProgress: setMessage,
      });
      rememberBid(proof.commitment, { ...identity, amount: bid, auctionId: auction.id });
      setResult({ ...proof, proofCommitment: proof.proofCommitment, proofHex: proof.proofBytesHex });
      setStep("bundle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not seal the bid.");
      setStep("form");
    }
  };

  // Build the shielded memo + ZIP-321 delivery URI once the commitments exist.
  useEffect(() => {
    if (!result) return;
    try {
      const m = buildSealedBidMemo({
        auctionId: auction.id,
        commitment: result.commitment,
        bidderBinding: result.bidderBinding,
        nullifier: result.nullifier,
        proofCommitment: result.proofCommitment,
      });
      setMemo(m);
      setDeliveryUri(
        buildBidDeliveryUri({ auctioneerAddress: auction.sellerAddress, memo: m, amountZat: DEFAULT_REQUEST_ZAT, expectedNetwork: ZCASH_NETWORK.id }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the delivery request.");
    }
  }, [result, auction.id, auction.sellerAddress]);

  useEffect(() => {
    if (!deliveryUri) return;
    QRCode.toDataURL(deliveryUri, { margin: 1, width: 200, errorCorrectionLevel: "L" }).then(setQr).catch(() => setQr(null));
  }, [deliveryUri]);

  const publish = async () => {
    if (!result) return;
    setError(null);
    try {
      const res = await fetch(`/api/auctions/${encodeURIComponent(auction.id)}/bids`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commitment: result.commitment,
          bidderBinding: result.bidderBinding,
          nullifier: result.nullifier,
          proofCommitment: result.proofCommitment,
          submittedAt: new Date().toISOString(),
          proofHex: result.proofHex,
          publicInputs: result.publicInputs,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not publish the sealed bid.");
      setPosted(true);
      setStep("done");
      onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish the sealed bid.");
    }
  };

  const downloadBundle = () => {
    if (!result) return;
    const bundle = {
      format: "zecpass-sealed-bid/1",
      auctionId: auction.id,
      network: ZCASH_NETWORK.name,
      ...result,
      memo,
      issuedAt: new Date().toISOString(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${shortId(auction.id)}.sealed-bid.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Let a tester place several bids in one sitting (each a new bidder), so a
  // competitive auction and a real settlement can be built from one browser.
  const resetForm = () => {
    setStep("form");
    setResult(null);
    setPosted(false);
    setMemo("");
    setDeliveryUri(null);
    setQr(null);
    setError(null);
    setBid(auction.reservePrice * 2);
  };

  if (!open && step === "form") {
    return (
      <section className="room-panel">
        <h2><Gavel size={16} /> Bidding is closed</h2>
        <p>This auction is not accepting sealed bids right now.</p>
      </section>
    );
  }

  return (
    <section className="room-panel">
      <h2><LockKeyhole size={16} /> Seal a bid</h2>
      <p className="room-lead">
        Prove your bid clears the reserve of {fmt(auction.reservePrice)} {auction.currency} without revealing it. The
        proof and a commitment are published; the number stays in this browser and travels to the seller in a shielded
        Zcash memo.
      </p>

      {step === "form" && (
        <>
          <label className="bid-slider">
            <span>Your bid</span>
            <div className="field-value"><strong>{fmt(bid)}</strong> {auction.currency}</div>
            <input
              type="range"
              min={auction.reservePrice}
              max={Math.max(auction.reservePrice * 10, auction.reservePrice + 200)}
              step={1}
              value={bid}
              onChange={(e) => setBid(Number(e.target.value))}
              aria-label="Your bid"
            />
          </label>
          <div className="room-actions">
            <button onClick={seal} disabled={bid < auction.reservePrice}>
              Seal this bid <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}

      {step === "proving" && (
        <div className="room-progress">
          <LoaderCircle className="spin" size={18} />
          <div>
            <strong>Proving in your browser</strong>
            <p>{message || "Starting…"}</p>
          </div>
        </div>
      )}

      {(step === "bundle" || step === "done") && result && (
        <div className="room-result">
          <p className="room-ok"><ShieldCheck size={15} /> Sealed bid proved and verified in this browser.</p>
          <dl className="room-grid">
            <div><dt>Bid commitment</dt><dd><code>{shortId(result.commitment, 10, 6)}</code></dd></div>
            <div><dt>Bidder binding</dt><dd><code>{shortId(result.bidderBinding, 10, 6)}</code></dd></div>
            <div><dt>Nullifier</dt><dd><code>{shortId(result.nullifier, 10, 6)}</code></dd></div>
            <div><dt>Shielded memo</dt><dd>{memoByteLength(memo)} / 512 bytes</dd></div>
          </dl>

          <div className="room-split">
            <div>
              <h3>1. Publish the commitment</h3>
              <p>Adds the sealed bid to the public board. Only commitments are published.</p>
              <button onClick={publish} disabled={posted}>
                {posted ? <><Check size={15} /> Published</> : <>Publish sealed bid <Stamp size={15} /></>}
              </button>
            </div>
            <div>
              <h3>2. Deliver it over Zcash</h3>
              <p>Send the memo to the seller in a shielded transaction. Only they can read it.</p>
              {deliveryUri ? (
                <>
                  <code className="room-uri">{deliveryUri}</code>
                  <div className="room-actions">
                    <a className="cred-action-link" href={deliveryUri}><Wallet size={14} /> Open in Zcash wallet</a>
                    <button className="ghost" onClick={downloadBundle}><Download size={14} /> Proof bundle</button>
                  </div>
                  {qr && (
                    // eslint-disable-next-line @next/next/no-img-element -- generated data-URL QR
                    <img className="room-qr" src={qr} alt="ZIP-321 sealed bid delivery QR code" width={140} height={140} />
                  )}
                </>
              ) : (
                <p className="warn">Could not build the delivery request.</p>
              )}
            </div>
          </div>
          {posted && (
            <div className="room-actions">
              <button className="ghost" onClick={resetForm}>Place another bid (new bidder) <ArrowRight size={14} /></button>
            </div>
          )}
        </div>
      )}

      {error && <p className="warn">{error}</p>}
    </section>
  );
}

/* --------------------------------------------------------------- sealed bids */

function SealedBids({
  auction, revealedCommitments, onPosted,
}: { auction: BoardAuction; revealedCommitments: Set<string>; onPosted: () => void }) {
  // A visitor can check any sealed bid's proof in their own browser. Nothing is
  // taken on the server's word: the range proof is the only reason to believe
  // the hidden bid is admissible.
  const [checked, setChecked] = useState<Record<string, boolean | "checking">>({});

  // Which sealed bids this browser placed (and can therefore reveal). Computed
  // after mount so the server and client markup agree.
  const [mine, setMine] = useState<Set<string>>(new Set());
  useEffect(() => {
    setMine(new Set(auction.sealedBids.filter((b) => recallBid(b.commitment)).map((b) => b.commitment)));
  }, [auction.sealedBids]);

  const checkBid = async (b: BoardAuction["sealedBids"][number]) => {
    setChecked((c) => ({ ...c, [b.commitment]: "checking" }));
    try {
      const ok = await verifySealedBidProof({ proofHex: b.proofHex, publicInputs: b.publicInputs });
      setChecked((c) => ({ ...c, [b.commitment]: ok }));
    } catch {
      setChecked((c) => ({ ...c, [b.commitment]: false }));
    }
  };

  return (
    <section className="room-panel">
      <h2><ShieldCheck size={16} /> Sealed bids on the board</h2>
      <p className="room-lead">
        These are commitments, not amounts. Check any bid&apos;s proof in your own browser to confirm the hidden amount
        is inside the auction&apos;s bounds, then reveal your own to make it public.
      </p>
      {auction.sealedBids.length === 0 ? (
        <p className="board-empty">No sealed bids yet.</p>
      ) : (
        <ul className="sealed-list">
          {auction.sealedBids.map((b) => {
            const revealed = revealedCommitments.has(b.commitment);
            const reveal = auction.reveals.find((r) => r.commitment === b.commitment);
            const state = checked[b.commitment];
            return (
              <li key={b.nullifier}>
                <code>{shortId(b.commitment, 12, 6)}</code>
                <span className="sealed-when">{new Date(b.submittedAt).toUTCString()}</span>
                <span className="reveal-state">
                  {state === "checking" ? <><LoaderCircle className="spin" size={13} /> checking…</>
                    : state === true ? <b className="ok"><Check size={13} /> proof valid</b>
                    : state === false ? <b className="bad"><X size={13} /> proof invalid</b>
                    : (
                      <button className="ghost" onClick={() => checkBid(b)}>
                        <ShieldCheck size={13} /> Verify proof
                      </button>
                    )}
                </span>
                {revealed ? (
                  <span className="sealed-open"><Eye size={13} /> {fmt(reveal?.amount ?? 0)} {auction.currency}</span>
                ) : mine.has(b.commitment) ? (
                  <RevealControls auction={auction} commitment={b.commitment} onPosted={onPosted} />
                ) : (
                  <span className="sealed-when">sealed</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RevealControls({ auction, commitment, onPosted }: { auction: BoardAuction; commitment: string; onPosted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // This browser placed the bid, so it holds the identity and the amount: reveal
  // is one click, with nothing to retype and no way to open it to a wrong number.
  const remembered = recallBid(commitment);

  const reveal = async () => {
    if (!remembered) return;
    setBusy(true);
    setError(null);
    try {
      const proof = await proveOpenBid({
        auctionId: auction.id,
        bid: remembered.amount,
        commitment,
        bidderSecret: remembered.secret,
        blinding: remembered.blinding,
      });
      const res = await fetch(`/api/auctions/${encodeURIComponent(auction.id)}/reveals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commitment,
          amount: remembered.amount,
          bidderBinding: proof.bidderBinding,
          proofHex: proof.proofBytesHex,
          publicInputs: proof.publicInputs,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not publish the reveal.");
      onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish the reveal.");
    } finally {
      setBusy(false);
    }
  };

  if (!remembered) return null;

  return (
    <span className="sealed-reveal">
      <button className="ghost" onClick={reveal} disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={13} /> : <Eye size={13} />} Reveal {fmt(remembered.amount)} {auction.currency}
      </button>
      {error && <em className="warn">{error}</em>}
    </span>
  );
}

/* ---------------------------------------------------------------- settlement */

function Settlement({ auction }: { auction: BoardAuction }) {
  const [verified, setVerified] = useState<Record<string, boolean | "checking" | "invalid">>({});

  // Verify each reveal's proof in the browser. A reveal is trusted only once its
  // proof checks out; the result feeds settlement below.
  const verifyAll = useCallback(async () => {
    for (const r of auction.reveals) {
      setVerified((v) => ({ ...v, [r.commitment]: "checking" }));
      try {
        const ok = await verifyOpenBidProof({ proofHex: r.proofHex, publicInputs: r.publicInputs });
        setVerified((v) => ({ ...v, [r.commitment]: ok }));
      } catch {
        setVerified((v) => ({ ...v, [r.commitment]: "invalid" }));
      }
    }
  }, [auction.reveals]);

  const outcome = useMemo(() => {
    // Only settle once every reveal has a final verdict, so the clearing price is
    // never shown mid-verification (where fewer confirmed bids read as a lower
    // second price).
    const settled =
      auction.reveals.length > 0 &&
      auction.reveals.every((r) => verified[r.commitment] === true || verified[r.commitment] === "invalid");
    if (!settled) return null;
    const confirmed = auction.reveals.filter((r) => verified[r.commitment] === true);
    if (confirmed.length === 0) return null;
    // Settlement runs on the reveals whose proofs checked out in this browser.
    return resolveAuction(
      { ...auction, pricingRule: auction.pricingRule as PricingRule },
      auction.sealedBids,
      confirmed.map((r) => ({ auctionId: auction.id, commitment: r.commitment, amount: r.amount, bidderBinding: r.bidderBinding })),
    );
  }, [auction, verified]);

  return (
    <section className="room-panel">
      <h2><Gavel size={16} /> Settlement</h2>
      <p className="room-lead">
        Reveals are verified in your browser before they count. An unproven or mismatched reveal is ignored by
        settlement.
      </p>

      {auction.reveals.length === 0 ? (
        <p className="board-empty">No bids have been revealed yet.</p>
      ) : (
        <>
          <div className="room-actions">
            <button onClick={verifyAll}>Verify {auction.reveals.length} reveal{auction.reveals.length === 1 ? "" : "s"} <ShieldCheck size={15} /></button>
          </div>
          <ul className="reveal-list">
            {auction.reveals.map((r) => {
              const state = verified[r.commitment];
              return (
                <li key={r.commitment}>
                  <code>{shortId(r.commitment, 12, 6)}</code>
                  <span>{fmt(r.amount)} {auction.currency}</span>
                  <span className="reveal-state">
                    {state === "checking" ? <><LoaderCircle className="spin" size={13} /> checking…</>
                      : state === true ? <b className="ok"><Check size={13} /> proof valid</b>
                      : state === "invalid" ? <b className="bad"><X size={13} /> proof invalid</b>
                      : <em>not yet verified</em>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {outcome && outcome.clearingPrice !== null && (
        <div className="outcome">
          <span className="mono-label">Outcome (from verified reveals)</span>
          <h3>Winning bid {fmt(outcome.winningBid ?? 0)} {auction.currency}</h3>
          <p>
            Clearing price <strong>{fmt(outcome.clearingPrice)} {auction.currency}</strong>
            {auction.pricingRule === "vickrey" ? " (second-price)" : " (first-price)"}, paid to the seller by a shielded
            Zcash settlement.
          </p>
          <code>{shortId(outcome.winnerCommitment ?? "", 14, 8)}</code>
        </div>
      )}
    </section>
  );
}
