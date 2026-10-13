import Link from "next/link";
import { ArrowRight, Eye, Gavel, LockKeyhole, ShieldCheck } from "lucide-react";
import { AuctionBoard } from "@/components/auction-board";
import { ZCASH_NETWORK } from "@/lib/zcash/config";

const steps = [
  { title: "Publish a public auction", text: "Reserve, pricing rule and timing are public. That is the part everyone should see." },
  { title: "Seal a bid in your browser", text: "A zero-knowledge proof shows your bid clears the reserve. The number never leaves your device." },
  { title: "Publish the commitment", text: "The board gets a commitment and a proof, never an amount. Anyone can re-check the proof." },
  { title: "Deliver it over Zcash", text: "The same commitments travel to the seller inside a shielded Zcash memo, readable only by them." },
  { title: "Reveal, then settle", text: "Winners reveal their amount with a proof it matches what they sealed. Settlement is a shielded payment." },
];

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="Main">
        <Link className="brand" href="/" aria-label="ZecPass home">
          <span className="brand-mark" aria-hidden="true" />
          ZecPass
        </Link>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <Link href="/playground">Playground</Link>
          <Link href="/create">Open an auction</Link>
          <span className="nav-net">Zcash {ZCASH_NETWORK.name}</span>
        </div>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <h1>The price is public. The bidders are not.</h1>
          <p>
            ZecPass runs a sealed-bid auction on Zcash. Every bid is proved in the bidder&apos;s own browser: it clears
            the reserve, it is well formed, and it cannot be claimed twice. What goes on the board is a commitment and a
            proof, never the amount.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/playground">Try it — prove a bid <ArrowRight size={16} /></Link>
            <Link className="text-button" href="/create">Open an auction</Link>
          </div>
          <p className="hero-note">
            Bids travel to the seller in a shielded Zcash memo. Transparent addresses are rejected. ZecPass never asks
            for a seed phrase or a key.
          </p>
        </div>

        <figure className="statement">
          <div className="statement-sheet">
            <header>
              <strong>Sealed bid</strong>
              <span>What the board sees</span>
            </header>
            <dl>
              <div><dt>Bid amount</dt><dd><span className="redact"><span aria-hidden="true">$2,400</span><span className="sr-only">hidden</span></span></dd></div>
              <div><dt>Bidder</dt><dd><span className="redact"><span aria-hidden="true">0x9f…41c</span><span className="sr-only">hidden</span></span></dd></div>
              <div><dt>Commitment</dt><dd><code>0x7ab3…c912</code></dd></div>
              <div><dt>Proof</dt><dd><b className="ok"><ShieldCheck size={12} /> valid</b></dd></div>
              <div><dt>Range proven</dt><dd>1 ≤ bid ≤ 5,000</dd></div>
              <div><dt>Nullifier</dt><dd><code>0x2c14…88ae</code></dd></div>
            </dl>
            <p className="statement-claim"><mark>Reserve cleared</mark><span>Proved</span></p>
          </div>
          <figcaption>Only the highlighted line and the commitments leave your device.</figcaption>
        </figure>
      </section>

      <section className="band shell" id="how">
        <div className="band-head">
          <h2>How it works</h2>
          <p>UltraHonk keeps the amount secret. Zcash keeps the bidder secret.</p>
        </div>
        <ol className="steps">
          {steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="band shell">
        <div className="band-head">
          <h2>Who can see what</h2>
          <p>Two independent privacy layers, doing different jobs.</p>
        </div>
        <table className="visibility">
          <caption>Sealed bids and reveals</caption>
          <thead>
            <tr><th scope="col">Information</th><th scope="col">Bidder</th><th scope="col">Board &amp; public</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row">The bid amount (before reveal)</th><td>Sees</td><td className="is-hidden">Never sees</td></tr>
            <tr><th scope="row">Your nullifier &amp; binding</th><td>Sees</td><td>Sees (opaque)</td></tr>
            <tr><th scope="row">The reserve and the rule</th><td>Sees</td><td>Sees</td></tr>
            <tr><th scope="row">The amount (after reveal)</th><td>Sees</td><td>Sees — that is what revealing means</td></tr>
            <tr><th scope="row">Who you are on Zcash</th><td>Sees</td><td className="is-hidden">Never sees</td></tr>
          </tbody>
        </table>
      </section>

      <section className="band shell">
        <div className="band-head">
          <h2>Where each technology earns its place</h2>
          <p>Neither is decoration; remove either and the design breaks.</p>
        </div>
        <dl className="facts">
          <div>
            <dt><Gavel size={15} /> UltraHonk</dt>
            <dd>
              Proves the bid is inside the auction&apos;s public bounds without revealing it, and derives a per-auction
              nullifier so one bidder cannot stuff the ballot. Reveals are proved to open the commitment sealed
              earlier, which is what makes the amount trustworthy once it is public.
            </dd>
          </div>
          <div>
            <dt><LockKeyhole size={15} /> Zcash</dt>
            <dd>
              Carries the bid to the seller inside a shielded memo, so nobody watching the chain can see who bid on
              what. Settlement is a shielded payment carrying the outcome. Transparent addresses are rejected outright.
            </dd>
          </div>
          <div>
            <dt><Eye size={15} /> The board</dt>
            <dd>
              A public, auditable list of commitments and proofs. Verification runs in each visitor&apos;s own browser,
              so the server is never trusted with the checking.
            </dd>
          </div>
        </dl>
      </section>

      <section className="proof-section">
        <div className="shell">
          <AuctionBoard />
        </div>
      </section>

      <footer className="shell footer">
        <span>ZecPass</span>
        <p>Sealed-bid auctions on Zcash, proved with Noir and UltraHonk.</p>
      </footer>
    </main>
  );
}
