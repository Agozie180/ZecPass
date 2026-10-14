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
- **Not tested against a live Zcash wallet.** The ZIP-321 request and memo
  follow the specs, but the end-to-end shielded flow has not been run with a
  real wallet.

## Reporting

Open an issue on the repository.
