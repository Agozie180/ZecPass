"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Gavel, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { AuctionSummary } from "@/lib/board/store";

const fmtZec = (n: number) => n.toLocaleString("en-US");

function shortId(id: string): string {
  return id.length <= 18 ? id : `${id.slice(0, 14)}…`;
}

function isOpen(a: AuctionSummary, now: number): boolean {
  return Date.parse(a.bidOpensAt) <= now && now < Date.parse(a.bidClosesAt);
}

export function AuctionBoard() {
  const [auctions, setAuctions] = useState<AuctionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auctions", { cache: "no-store" });
      const data = (await res.json()) as { auctions?: AuctionSummary[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load the board.");
      setAuctions(data.auctions ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the board.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const now = Date.now();

  return (
    <section className="board" aria-label="Public auction board">
      <div className="board-head">
        <div>
          <span className="mono-label">Public board</span>
          <h3>Open auctions</h3>
          <p>Bids are sealed: the board holds commitments, never amounts, until a reveal.</p>
        </div>
        <div className="board-actions">
          <button className="ghost" onClick={load} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Refresh
          </button>
          <Link className="primary-button" href="/create">
            Open an auction <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {error && <p className="warn">{error}</p>}

      {auctions === null ? (
        <p className="board-empty"><LoaderCircle className="spin" size={15} /> Loading the board…</p>
      ) : auctions.length === 0 ? (
        <p className="board-empty"><Gavel size={15} /> No auctions yet. Open one to start bidding.</p>
      ) : (
        <ul className="board-list">
          {auctions.map((a) => (
            <li key={a.id}>
              <Link className="board-card" href={`/auctions/${encodeURIComponent(a.id)}`}>
                <div className="board-card-top">
                  <span className={`board-state ${isOpen(a, now) ? "open" : "closed"}`}>
                    {isOpen(a, now) ? "Bidding open" : "Bidding closed"}
                  </span>
                  <span className="board-rule">{a.pricingRule === "vickrey" ? "Second-price" : "First-price"}</span>
                </div>
                <strong>{a.title}</strong>
                <p>{a.description}</p>
                <div className="board-meta">
                  <span><b>{fmtZec(a.reservePrice)} {a.currency}</b> reserve</span>
                  <span><b>{a.sealedCount}</b> sealed</span>
                  <span><b>{a.revealedCount}</b> revealed</span>
                </div>
                <code className="board-id">{shortId(a.id)}</code>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="board-note">
        <ShieldCheck size={14} /> Every sealed bid on this board is a zero-knowledge commitment. Opening a board entry
        and verifying its proof happens in your browser; nothing about a bid amount is sent to the server.
      </p>
    </section>
  );
}
