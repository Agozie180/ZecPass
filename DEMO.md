# ZecPass demo

A short walkthrough for judges. You will prove a real bid in your own browser,
watch the amount stay private, try to cheat and watch the circuit refuse, settle
a sealed-bid auction on the live board, and, if you have a Zcash wallet, deliver
a sealed bid over Zcash mainnet and read it on the other side. Nothing is mocked:
every proof is real Noir/UltraHonk, generated and verified in your browser.

## Recorded mainnet bid

The maintainer reported one completed mainnet auction bid and wallet
confirmation on **2026-10-23**. Its transaction ID is:

```text
2b15d7c280c9f44e1a4f5266c290c7cd547a34427219e0dc9e78c1a277ff498a
```

The supplied memo matches the bid on
[this auction](https://zec-pass.vercel.app/auctions/sealed-note-10-zec-reserve-1y0lvlb),
and the public proof independently re-verifies. Open the
[mainnet evidence record](docs/MAINNET-EVIDENCE.md) for the exact memo, addresses
with their documented roles, saved proof and verification command. A judge can
inspect this existing example without sending a payment. The starting reserve
was **10 ZEC**, and the maintainer chose **11** for this run. The saved auction
and proof record 11 as the configured reserve; the title retains the starting
10 ZEC value.

The wallet confirmation is reported by the maintainer; the public proof checks
bid admissibility. This example records bid delivery, with settlement payment
confirmation still outside the application.

## Setup

**Nothing to install:** the live demo at https://zec-pass.vercel.app runs on
Zcash **mainnet**. Everything except sending a delivery payment is free.

**Or run it locally:**

```bash
npm install
npm run dev
```

Open http://localhost:3000. A local run is on **testnet** by default, so nothing
there touches real funds. Proving downloads the Barretenberg CRS from
`crs.aztec.network` on first use, so keep the browser online.

## 90-second script (for the recorded demo)

Lead with the moment a judge can't forget: the math refusing a lie.

- **0:00–0:10 — Hook.** Open `/playground`. "A sealed bid is a zero-knowledge proof — watch." Drag the slider, click **Seal my bid**.
- **0:10–0:30 — The split.** When the proof lands, point at the two columns: "My bid is on the left, in my browser. On the right is everything the world sees — a commitment, a nullifier, a ~14 KB proof, the range it proves. No amount. And it verified *in my browser*, not on a server."
- **0:30–0:45 — Try to cheat (the unfakeable moment).** Click **Seal a bid below the reserve** → "The circuit refuses: a dishonest bid has no proof." Click **Reveal a different number** → "I can't lie at reveal either."
- **0:45–1:15 — Deliver it over Zcash mainnet.** Open an auction whose seller address is your wallet, seal a bid, and scan the QR with the phone wallet on camera. Send. Cut to the wallet receiving it and open the memo: "`ZECBID1`, the auction, the commitment on the board. No amount. The seller learns a bid arrived; the chain shows a shielded transaction with no sender, receiver, amount or memo."
- **1:15–1:30 — Settle.** On a settled auction, **Verify reveals** → the outcome shows the winning bid and the second-price clearing price. "Winner determination on proofs you verified yourself. The price is public; the bidders are not."

Record a few takes. The cheat refusal and the memo arriving are the two shots
that have to land.

## Part 1 — the Playground (prove it to yourself, no wallet)

From the landing page click **Try it — prove a bid**, or go to `/playground`
(on the live demo or locally). This is the fastest way to see the whole idea.

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

Go back to the board at `/`. It is pre-seeded with three real
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
carrying a ZIP-302 memo (watch the 512-byte counter), a QR code (tap it to
enlarge), an "Open in Zcash wallet" link, and a **Proof bundle** download.

You can check the delivery at three depths:

1. **No wallet.** Download the proof bundle and read its `memo` field. That is
   the exact text the shielded payment carries: `ZECBID1|` followed by the
   auction id, commitment, binding, nullifier and proof commitment. No amount.
2. **Scan only.** Scan the QR with any mainnet Zcash wallet and stop at the
   confirmation screen. The wallet shows the seller address, 0.0001 ZEC and the
   memo, pre-filled from the QR.
3. **Send it to yourself.** Open your own auction (**Open an auction**) with your
   wallet's shielded address as the seller, seal a bid there, scan and send from
   your shielded balance. Only the network fee is spent. Open the received
   transaction: the memo matches the commitment on the board.

For a manual delivery record, note the transaction ID and compare all five memo
fields with the proof bundle: auction ID, commitment, binding, nullifier and
proof commitment. Re-verify the bid on the board separately. Confirm the payment
and read the memo in the receiving wallet; a public transaction lookup cannot
show the shielded memo. Publishing a memo alongside its transaction ID links
that transaction to the auction, as disclosed for the recorded example.

The "Open in Zcash wallet" link only works on a device where a wallet app is
registered for `zcash:` links, which is usually a phone. On a laptop, scan the QR.

On the seeded auctions the seller is the project author's own shielded address,
so a payment sent there goes to the author. Deliver to an auction you opened
yourself with your own address (below) if you want to keep the funds.

### Reveal and settle
Reveal your bid, then open the **Settlement** panel and click **Verify reveals**.
Each reveal's proof is re-verified in your browser; only proofs that check out
count. The outcome shows the winning bid and the clearing price under the
auction's rule (first-price, or second-price / Vickrey), to be paid to the seller
by a shielded Zcash settlement. Winner determination runs on proofs you verified
yourself — Zcash has no smart contracts by design, so off-chain, in-browser is
the correct place for it, not a gap.

## What is honest about this demo

- **Mainnet, deliberately.** The live demo is on mainnet so judges can use the
  wallet they already have. Proving, verifying, revealing and computing the
  auction outcome are free. A delivery moves real ZEC (0.0001 plus the fee);
  paying the clearing price is a separate wallet payment. Local
  runs stay on testnet.
- **Publishing to the board is a clearnet HTTP POST,** so the board host sees the
  bidder's IP. The ZK hides the amount and Zcash hides the bidder-to-seller
  delivery, but network anonymity against the board itself needs Tor or a VPN.
  This is the one explicitly non-private step, not hidden.
- **No deposit or escrow, and reveal is voluntary.** The range proof is about a
  number, not about funds.
- **The board cannot confirm a payment landed.** Zcash has no contract to read;
  confirming an incoming shielded payment needs the seller's viewing key and a
  light client. The seller's own wallet is where a delivery is confirmed. The
  maintainer's recorded manual confirmation does not add automatic confirmation
  to the board.
- **Not audited.** This is hackathon software.

The seeds are committed at `lib/board/seed-data.<network>.json` (regenerate with
`npm run seed:board`, see the README's Networks section); the seed for the
running network loads when no live board exists yet. Full security detail is in
[`docs/SECURITY.md`](docs/SECURITY.md); the case against the judging axes is in
[`docs/WHY-THIS-WINS.md`](docs/WHY-THIS-WINS.md).
