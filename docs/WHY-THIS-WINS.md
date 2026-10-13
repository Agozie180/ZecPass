# Why this wins

ZecPass is a sealed-bid auction on Zcash: the price is public, the bidders are
not. It is scored on four axes. Here is where it stands on each, with the
specifics a judge can check rather than take on faith.

## Privacy

The privacy is verifiable, not asserted. Every sealed bid on the board is a
Noir / UltraHonk proof plus a commitment, and anyone can re-verify that proof in
their own browser straight from the board. You do not have to trust the server,
the author, or this document; you re-run the check yourself (see `DEMO.md`,
Part 2, and the Playground in Part 1).

What is hidden, and by what:

- The **bid amount** is a private circuit input. The `sealed_bid` public inputs
  are the currency tag, the reserve, the bound, and the three output hashes
  (commitment, binding, nullifier). The amount is not among them. You can confirm
  this in `lib/board/seed-data.json` or the board's network response: the public
  inputs carry the reserve (10) and the bound (1000) in the clear plus three
  hashes, and no bid.
- The **bidder-to-seller delivery** is a shielded Zcash ZIP-321 request with a
  ZIP-302 memo. Transparent addresses are rejected, so a bid cannot be delivered
  in the clear.
- The **bidder's secret and per-auction blinding** never leave the browser. They
  live in `localStorage` and feed the binding and the nullifier; losing them
  means a sealed bid can no longer be revealed, which is the honest cost of
  keeping identity local.

The boundary is stated plainly, because leaks are disqualifying: posting a sealed
bid to the shared board is a clearnet HTTP POST, so the board host sees the
bidder's IP. ZecPass hides the amount (ZK) and the bidder-to-seller link (Zcash);
board-level network anonymity needs Tor or a VPN. We mark that step as the
non-private one rather than claim an anonymity we do not provide. `docs/SECURITY.md`
is explicit about this and the other boundaries.

## Usefulness

Sealed-bid auctions are a real mechanism, used wherever revealing bids early
would distort them: treasury sales, OTC blocks, procurement, spectrum-style
allocation. ZecPass runs the whole mechanism. A seller opens an auction with a
public reserve and a pricing rule (first-price or Vickrey second-price, both
implemented), bidders seal admissible bids, the board holds commitments, bidders
reveal with a proof that the revealed amount opens what they sealed, and
settlement resolves the clearing price for a shielded payment.

Two properties make it trustworthy to use, and you can feel both in the demo by
trying to cheat: a bidder cannot bid below the reserve (no such proof exists), and
cannot reveal a different number than they sealed (`open_bid` will not prove it).

What it deliberately does not do, as scope rather than oversight: no deposit or
escrow (the range proof is about a number, not funds), reveal is voluntary, and
the board does not confirm that a settlement payment landed (Zcash has no contract
for it to read). These are the honest edges of a one-window build, and
`docs/SECURITY.md` names each.

## Execution

It runs, and the parts that matter are tested:

- The full round trip, create to seal to publish to verify to reveal to settle,
  passes in a real browser.
- A real UltraHonk proof generates and verifies in-browser in about 10 to 25
  seconds. It is not mocked, and the same proof re-verifies from the board.
- Circuit tests pass: `sealed_bid` 7 of 7 and `open_bid` 5 of 5 under `nargo`.
- The board ships pre-seeded with real auctions carrying real proofs and reveals,
  so the app is alive on first load. Setup is `npm install && npm run dev`.

One execution detail worth noting because it is easy to get wrong: `@aztec/bb.js`
ships a prebuilt browser bundle that Next's bundler cannot re-process, so it is
vendored and loaded as a native ES module. Browser proving genuinely runs on the
client; it is not a server-side shortcut dressed up as in-browser.

## Originality

ZecPass is built for this hackathon on the model Zcash actually has, not one
borrowed from a contract chain. Zcash has no smart contracts by design, so
verification and winner determination happen off-chain, in each visitor's
browser, and Zcash does the two jobs it is uniquely good at: a shielded delivery
channel to the seller and a shielded settlement rail. That is the correct
architecture for this chain, not a workaround.

The composition is the point, and both halves are load-bearing:

- Remove **UltraHonk** and the board either leaks bid amounts or becomes an
  unverifiable list of numbers you have to trust. The ZK is what lets a public
  board hold bids without revealing them and still be auditable by anyone.
- Remove **Zcash** and the delivery to the seller and the settlement happen in
  the clear, so the participant is no longer private. The claim that the bidders
  are not public collapses.

The ZK (Aztec's Noir / UltraHonk) and the privacy chain (Zcash's shielded
transactions, ZIP-321, ZIP-302) are different stacks doing different jobs,
composed deliberately. Zcash's own zero-knowledge is Groth16 (Sapling) and Halo 2
(Orchard); the in-browser range and opening proofs are Aztec's, used as a library,
which the rules allow. Nothing here is a repackaged existing product.
