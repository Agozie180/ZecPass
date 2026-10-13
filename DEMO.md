# ZecPass demo

A 60-second, zero-setup walkthrough for judges. You will prove a real bid in your
own browser, watch the amount stay private, try to cheat and watch the circuit
refuse, then settle a sealed-bid auction on the live board. Nothing is mocked —
every proof is real Noir/UltraHonk, generated and verified in your browser.

## Setup, one command

```bash
npm install
npm run dev
```

Open http://localhost:3000. That is the whole setup. The app runs on Zcash
**testnet** by default, so nothing here touches real funds. Proving downloads the
Barretenberg CRS from `crs.aztec.network` on first use, so keep the browser
online.

## 90-second script (for the recorded demo)

Lead with the moment a judge can't forget: the math refusing a lie.

- **0:00–0:10 — Hook.** Open `/playground`. "A sealed bid is a zero-knowledge proof — watch." Drag the slider, click **Seal my bid**.
- **0:10–0:35 — The split.** When the proof lands, point at the two columns: "My bid, 50 ZEC, is on the left, in my browser. On the right is everything the world sees — a commitment, a nullifier, a ~14 KB proof, the range it proves. No amount. And it verified *in my browser*, not on a server."
- **0:35–0:55 — Try to cheat (the unfakeable moment).** Click **Seal a bid below the reserve** → "The circuit refuses: a dishonest bid has no proof." Click **Reveal a different number** → "I can't lie at reveal either. Soundness isn't a check you can skip; it's the only thing that convinces anyone, and it can't be built for a false statement."
- **0:55–1:20 — A real auction on Zcash.** Go to `/`. "A live board of real sealed bids — commitments only." Open an auction, click **Verify proof** (→ proof valid). Point at **Deliver it over Zcash**: "the bid reaches the seller in a shielded ZIP‑321 memo — nobody watching the chain sees who bid on what."
- **1:20–1:30 — Settle.** Open Settlement, **Verify reveals** → the outcome shows the winning bid and the second-price clearing price. "Winner determination on proofs you verified yourself. Zcash has no contracts, so this is off-chain by design. The price is public; the bidders are not."

Record a few takes — the cheat-refusal is the shot that has to land.

## Part 1 — the Playground (prove it to yourself, no wallet)

From the landing page click **Try it — prove a bid**, or go to
http://localhost:3000/playground. This is the fastest way to see the whole idea.

### Act 1 — seal a bid
Drag the slider to any amount and click **Seal my bid**. Watch the progress step
through loading Noir and Barretenberg, generating the witness, generating the
proof, and verifying it — a real UltraHonk proof, ~10-25s the first time (the CRS
caches, so later proofs are faster). When it lands you get a split card:

- **What only you know:** your bid, big, on the left.
- **What the whole world sees:** the commitment, the nullifier, the proof size
  (~14,500 bytes) and the proven range — on the right. **Your number is not in
  that column.**

### Act 2 — try to cheat the seal
Click **Seal a bid below the reserve**. This asks the circuit to prove a bid of 3
against a reserve of 10. Watch it refuse: `assert(bid >= reserve)` is
unsatisfiable, so no witness and no proof can be built. There is no honest proof
of a dishonest bid.

### Act 3 — reveal, honestly then dishonestly
Click **Reveal a different number** — the `open_bid` circuit tries to prove your
new number opens the commitment you sealed, and cannot, so the reveal is refused.
Then click **Reveal my real bid** and it opens cleanly.

Why this matters: soundness is not a server check you have to trust. The proof is
the only thing that convinces anyone, and it cannot be produced for a false
statement. You just watched that happen, twice.

## Part 2 — the live public board

Go back to the board at http://localhost:3000. It is pre-seeded with three real
auctions (a Vickrey collectible, a first-price `.zec` handle, and an open relay
slot), each carrying **real, verifiable** sealed bids — some already revealed.

### Verify someone else's sealed bid
Open an auction, and under "Sealed bids on the board" click **Verify proof** on
any entry. It re-runs the zero-knowledge verification in your browser and shows
"proof valid". The server was never asked whether the bid is admissible — the
proof was. For `sealed_bid` the public inputs are the currency tag, the reserve,
the bound, and the three output hashes; the bid amount is not among them.

### Seal and deliver your own
On the open auction ("Priority relay slot"), drag the slider and **Seal this
bid** (real proof again), then **Publish sealed bid**. It joins the board as a
commitment with no amount. "Deliver it over Zcash" shows a real ZIP-321 request
carrying a ZIP-302 memo (watch the 512-byte counter), an "Open in Zcash wallet"
link, and a QR code — the private path to the seller.

### Reveal and settle
Reveal your bid, then open the **Settlement** panel and click **Verify reveals**.
Each reveal's proof is re-verified in your browser; only proofs that check out
count. The outcome shows the winning bid and the clearing price under the
auction's rule (first-price, or second-price / Vickrey), to be paid to the seller
by a shielded Zcash settlement. Winner determination runs on proofs you verified
yourself — Zcash has no smart contracts by design, so off-chain, in-browser is
the correct place for it, not a gap.

## What is honest about this demo

- **Testnet.** The seed and the flow are testnet; nothing touches real funds.
- **Publishing to the board is a clearnet HTTP POST,** so the board host sees the
  bidder's IP. The ZK hides the amount and Zcash hides the bidder-to-seller
  delivery, but network anonymity against the board itself needs Tor or a VPN.
  This is the one explicitly non-private step, not hidden.
- **No deposit or escrow, and reveal is voluntary.** The range proof is about a
  number, not about funds.
- **The board cannot confirm a settlement payment landed.** Zcash has no contract
  to read; confirming an incoming shielded payment needs the seller's viewing key
  and a light client.
- **Not audited.** This is hackathon software.

The seed is committed at `lib/board/seed-data.json` (regenerate with
`npm run seed:board`); it is loaded when no live board exists yet. Full security
detail is in [`docs/SECURITY.md`](docs/SECURITY.md); the case against the judging
axes is in [`docs/WHY-THIS-WINS.md`](docs/WHY-THIS-WINS.md).
