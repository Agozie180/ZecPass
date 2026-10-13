# ZecPass

The price is public. The bidders are not.

ZecPass runs a **sealed-bid auction on Zcash**. A bidder proves, in their own
browser, that their bid clears the reserve — without revealing the amount. The
sealed bid is published to a shared public board as a commitment, and delivered
to the seller inside a shielded Zcash memo. When bidding closes, a bidder can
reveal their amount with a second proof that it genuinely opens the commitment
they sealed. Settlement is a shielded payment.

Two privacy layers do two different jobs:

- **UltraHonk hides the price.** The `sealed_bid` circuit proves `reserve ≤ bid ≤ bound`
  without revealing the bid, and derives a per-auction nullifier so one bidder
  cannot stuff the ballot. The `open_bid` circuit proves a revealed amount opens
  the sealed commitment, so a bidder cannot lie at reveal time.
- **Zcash hides the participants.** Bids travel to the seller as a ZIP-321
  payment request carrying a ZIP-302 memo, readable only by the seller.
  Settlement is a shielded payment. Transparent addresses are rejected.

## How it works

1. A seller opens an auction with a public reserve, a pricing rule (first-price
   or second-price / Vickrey) and a bidding window.
2. A bidder enters an amount. Nothing leaves the browser. A Noir circuit, proved
   with Barretenberg UltraHonk in the browser, shows the bid is in range.
3. The sealed bid — a commitment, a binding, a nullifier and the proof, **never
   the amount** — is published to the public board, and delivered to the seller
   in a shielded ZIP-321 payment request.
4. Anyone can open the board and re-check a sealed bid's proof in their own
   browser. The server is never trusted with the checking.
5. After bidding closes, a bidder reveals their amount with an `open_bid` proof
   that it opens their commitment. Settlement pays the clearing price to the
   seller over a shielded Zcash payment.

Zcash has no smart contracts, so winner determination and verification happen
off-chain, in the browser. Zcash's job is the private delivery channel and the
private settlement rail.

## The circuits

Both are Noir 1.0.0-beta.9, proved and verified with UltraHonk (`@aztec/bb.js`).

`circuits/sealed_bid` — prove a bid is admissible without revealing it.
- Private: `bid`, `blinding`, `bidder_secret`
- Public inputs: `currency` (an auction tag), `min_reserve`, `max_bound`
- Public outputs: `bid_commitment = pedersen([bid, blinding, currency])`,
  `bidder_binding = pedersen([secret, currency, 1])`,
  `nullifier = pedersen([secret, currency, 2])`
- Asserts `min_reserve ≤ bid ≤ max_bound`. A below-reserve bid is unsatisfiable,
  so no proof exists.

`circuits/open_bid` — prove a revealed amount opens a sealed commitment.
- Private: `bidder_secret`, `blinding`
- Public inputs: `bid` (now revealed), `currency`, `expected_commitment`
- Asserts `pedersen([bid, blinding, currency]) == expected_commitment`, and
  returns the bidder binding so the reveal is tied to the sealer.

## Run it

```bash
npm install
cp .env.example .env.local    # choose testnet or mainnet
npm run dev
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

Proving loads the Barretenberg CRS from `crs.aztec.network` on first use, so the
browser needs internet access. `@aztec/bb.js` ships a prebuilt browser bundle
that Next's bundler cannot process, so it is vendored into `public/vendor/bb/`
and loaded as a native ES module; `npm run vendor:bb` refreshes that copy.

Circuit tooling (only needed if you change a circuit):

```bash
npm run circuit:setup   # installs nargo 1.0.0-beta.9
npm run circuit:test    # nargo test in both circuits
npm run circuit:build   # recompile artifacts/noir/{sealed_bid,open_bid}.json
```

## Layout

| Path | What is there |
| --- | --- |
| `app/` | Next.js UI: landing page, create-auction page, auction room, board API routes |
| `components/` | The board, the create form, and the auction room (seal / reveal / verify / settle) |
| `lib/proof/` | Browser UltraHonk proving for both circuits, shared field primitives, per-browser secrets |
| `lib/domain/` | Auction model: lifecycle, admission, first-price and Vickrey resolution |
| `lib/zcash/` | Address validation, ZIP-302 memo, ZIP-321 payment URIs, sealed-bid envelope |
| `lib/board/` | The public board store (sealed bids and reveals) |
| `circuits/` | The two Noir circuits and their tests |
| `artifacts/noir/` | Compiled circuits and checksums |

## The public board

The board is a shared, public list of auctions, sealed bids and reveals, served
by the API routes under `app/api/auctions`. It stores **commitments and proofs,
never bid amounts**; an amount appears only once its owner reveals it. It
persists to a single JSON file (`data/board.json`) — simple to run anywhere and
easy to swap for a database.

## Known limits

Read `docs/SECURITY.md`. Short version: the board does not confirm that a
settlement payment actually landed (Zcash has no contracts for it to check); the
flow has not been run against a live Zcash wallet; the public board's storage is
a JSON file that resets if the host is wiped; bidder-identity privacy depends on
the bid actually being sent as a shielded transaction (the app builds the
request, the wallet does the shielding); and nothing has been audited.

## For judges

Start with [`DEMO.md`](DEMO.md): a 60-second, zero-setup walkthrough.

Fastest path: `npm install && npm run dev`, open http://localhost:3000, and click
**Try it — prove a bid** (the `/playground`). There you seal a real bid, see the
amount stay private, and then **try to cheat** — bid below the reserve, or reveal
a different number — and watch the circuit refuse. No wallet, no setup.

Then the live board at http://localhost:3000 is pre-seeded with real auctions
carrying real, verifiable sealed bids and reveals, so there is something to
verify and settle on first load. Open an auction, click **Verify proof** on a
sealed bid (it re-checks in your browser), seal one of your own, reveal, and
settle. Testnet by default, so nothing touches real funds.

For the case against the judging axes — privacy, usefulness, execution,
originality — see [`docs/WHY-THIS-WINS.md`](docs/WHY-THIS-WINS.md). For the honest
limits, see [`docs/SECURITY.md`](docs/SECURITY.md).

## License

MIT
