# Security notes

ZecPass is hackathon software. It has not been audited.

## What the proofs establish

**A sealed bid** (`circuits/sealed_bid`). Given a valid proof, the prover knew a
`bid`, a `blinding` and a `bidder_secret` such that `min_reserve ≤ bid ≤ max_bound`,
and the published `bid_commitment`, `bidder_binding` and `nullifier` were derived
from them. The bid amount is not revealed. A bid outside the range makes the
circuit unsatisfiable, so no proof can exist for it.

**A reveal** (`circuits/open_bid`). Given a valid proof, the disclosed `bid` and
a known `blinding` open the exact `bid_commitment` sealed earlier, and the
revealer knew the `bidder_secret` behind the binding. A bidder therefore cannot
reveal a different amount than the one they sealed, and cannot open someone
else's commitment without its blinding.

Both proofs are generated and verified with UltraHonk in the browser, and anyone
can re-verify a published proof in their own browser from the board.

## The verifier, and what you are trusting

Proving and verification use Barretenberg (`bb`) UltraHonk. In the browser this
is `@aztec/bb.js`, pinned to `0.87.0` and vendored verbatim from the npm package
into `public/vendor/bb/` by `scripts/vendor-bb.mjs` (it is not re-bundled — see
`lib/proof/auction-proofs.ts`). The circuits are Noir `1.0.0-beta.9`.

So verification trust rests on the upstream compiled artifact: ZecPass does not
re-derive the BN254 pairing or the UltraHonk verifier from source, it runs
Aztec's. Two things keep that honest and checkable:

- the versions are pinned (bb.js `0.87.0`, Noir `1.0.0-beta.9`) and the vendored
  bundle is a byte copy of the published package, so it can be diffed against npm
  or Aztec's `barretenberg` repo at that tag; and
- the same circuits prove and verify through the standalone `bb` CLI (see
  `circuits/README.md`), so a reviewer can reproduce a proof and run the native
  verifier independently of this app's bundle.

Vendoring the Barretenberg Rust and building the verifier from source would close
the loop entirely. Today it is upstream-trusted — stated plainly, not hidden.

## Privacy properties

- **The bid amount stays in the browser until reveal.** The public board stores
  commitments and proofs, never amounts. The amount is disclosed only when its
  owner chooses to reveal.
- **Delivery to the seller is shielded.** The bid reaches the seller as a
  ZIP-321 request with a ZIP-302 memo to a shielded address; transparent
  addresses are rejected, so a bid cannot be sent in the clear.
- **The commitment is hiding and binding.** A per-bid `blinding` means equal bids
  produce different commitments, and the Pedersen commitment cannot be opened to
  a different amount.
- **Secrets are local.** `bidder_secret` and each auction's `blinding` live in
  `localStorage` and are never transmitted. Clearing site data loses them, after
  which an existing sealed bid can no longer be revealed — the honest cost of
  keeping the bidder's secret on their own device.
- The Barretenberg CRS is fetched from `crs.aztec.network` when proving. That
  request reveals that the browser is about to prove something, not what.

## Networks

The live demo runs on Zcash **mainnet**; local development defaults to
**testnet**. The network is fixed at build time (`NEXT_PUBLIC_ZCASH_NETWORK`).

- **Proofs are bound to a network.** The network is mixed into each auction's
  currency tag, which is a public input of both circuits, so a proof made on
  testnet does not verify on mainnet. A test checks that each committed seed
  carries its own network's tag.
- **Each network has its own board.** Separate seed files and a separate KV key
  per network mean a local testnet run cannot write to the live mainnet board.
- **Seller addresses are checked twice.** The create form and the
  `POST /api/auctions` route both reject transparent addresses, bad checksums,
  and addresses for the other network. The check proves the address is
  well-formed, not that anyone controls it, and it does not decode the receivers
  inside a unified address; the sending wallet is the final check.
- **Mainnet means real money.** Sending a delivery is a real shielded payment of
  0.0001 ZEC plus the network fee. On the seeded auctions the seller is the
  project author's own shielded address, so a delivery sent there goes to the
  author; open your own auction with an address you hold to keep the funds.
- **Privacy of the delivery depends on the sending wallet.** ZecPass refuses
  transparent *recipients*. A bidder who pays from a transparent balance still
  reveals their own address on chain; send from a shielded balance.

## Mainnet delivery validation

On **2026-10-23**, the maintainer reported completing one mainnet auction bid
and confirming the transaction in their wallet. The supplied transaction ID is
`2b15d7c280c9f44e1a4f5266c290c7cd547a34427219e0dc9e78c1a277ff498a`.
The [evidence record](MAINNET-EVIDENCE.md) preserves the exact 302-byte
`ZECBID1` memo, address roles and the corresponding public board proof.

The memo's auction ID and four hashes match the published bid. Its proof
commitment was recomputed, its public inputs checked against the auction and
mainnet tag, and its UltraHonk proof independently re-verified successfully.
The first supplied address matches the auction's seller address. The second
is recorded only as the maintainer's wallet confirmation address; its ownership
and sender/receiver role are not inferred from its checksum or from the board.

This adds a manual wallet confirmation to the existing automated checks of the
ZIP-321 request, memo encoding and on-screen QR. The wallet confirmation is
reported by the maintainer. Public proof verification cannot establish which
transaction carried the memo; no independent chain lookup or wallet decryption
was performed for the evidence record. The board has no automatic delivery or
settlement confirmation.

Publishing this memo, transaction ID and the supplied addresses voluntarily
links this test transaction to the auction. That association is disclosed in
the documentation; it is not information recovered by decrypting the public
chain. A shielded transaction ID alone does not reveal its encrypted memo or
establish the roles of the supplied addresses.

The memo is a bid-delivery envelope. It establishes no settlement payment,
funding guarantee or audit result. The limits below still apply.

## What it does NOT establish — read this

- **Posting to the public board is a normal clearnet request.** The ZK keeps the
  *amount* private and Zcash keeps the *seller-delivery* private, but publishing
  a sealed bid is an HTTP POST from the bidder's browser, so the board host (and
  anyone watching the network) can associate that bid with the bidder's IP. The
  on-board binding and nullifier are opaque hashes, but they are not network
  anonymity. For participant privacy against the board host, post over Tor or a
  VPN. The design keeps Zcash as the private channel between bidder and *seller*;
  it does not claim anonymity against the *board*.
- **It does not prove the bidder can pay.** The range proof is about a number,
  not about funds. A production auction would bond or escrow the bid; this does
  not.
- **It does not confirm settlement.** The board cannot check that a shielded
  settlement payment landed — Zcash has no contract for it to read, and
  confirming an incoming shielded payment needs the seller's viewing key and a
  light client. Settlement is a real ZIP-321 request; whether it is paid is
  off-board.
- **Reveal is voluntary.** A winner who never reveals is simply not counted;
  nothing on chain forces a reveal or slashes a deposit.
- **The board is trusted for availability, not for truth.** A malicious host
  could drop, delay or reorder bids. Correctness is auditable (every proof is
  re-checkable), but availability and ordering are not guaranteed by the board
  alone.
- **Anti-sybil is per-secret, not per-person.** The nullifier stops one
  `bidder_secret` from placing two admissible bids on one auction. A bidder who
  generates a fresh secret can bid again; the board does not know people.
- **Wallet confirmation remains a manual check.** One mainnet bid delivery has
  been reported as confirmed in the maintainer's wallet (see
  [Mainnet delivery validation](#mainnet-delivery-validation)). Automated browser
  checks cover the request, memo and QR; they do not send funds or read a
  wallet. A valid bid proof does not prove that a payment arrived.
- **No settlement request in the UI yet.** The settlement ZIP-321 request is
  built and unit-tested (`buildSettlementUri`), but the settlement panel shows the
  outcome only; paying the seller is the winner's own step.

## Reporting

Open an issue on the repository.
