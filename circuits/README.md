# Circuits

Two Noir circuits power the sealed-bid auction. Both are Noir `1.0.0-beta.9`
(matching `@noir-lang/noir_js` and the compiled artifacts), proved and verified
with Barretenberg UltraHonk.

## `sealed_bid`

Prove a bid is admissible without revealing it.

| | |
| --- | --- |
| Private | `bid`, `blinding`, `bidder_secret` |
| Public inputs | `currency` (auction tag), `min_reserve`, `max_bound` |
| Public outputs | `bid_commitment = pedersen([bid, blinding, currency])`, `bidder_binding = pedersen([secret, currency, 1])`, `nullifier = pedersen([secret, currency, 2])` |

Asserts `min_reserve ≤ bid ≤ max_bound`. A below-reserve or over-bound bid makes
the circuit unsatisfiable, so no proof exists; the amount itself never leaves the
witness. The nullifier is per `(bidder_secret, auction)`, so one bidder cannot
place two admissible bids on the same auction.

## `open_bid`

Prove a revealed amount opens a commitment sealed earlier.

| | |
| --- | --- |
| Private | `bidder_secret`, `blinding` |
| Public inputs | `bid` (revealed), `currency`, `expected_commitment` |
| Public output | `bidder_binding = pedersen([secret, currency, 1])` |

Asserts `pedersen([bid, blinding, currency]) == expected_commitment`. A bidder
therefore cannot reveal a different amount than they sealed, and the returned
binding ties the reveal to the original sealer.

## Public-input ordering

UltraHonk exposes a circuit's `pub` inputs first, in declaration order, then its
public return values. For `sealed_bid` that is
`[currency, min_reserve, max_bound, bid_commitment, bidder_binding, nullifier]`
(6 fields). `lib/proof/auction-proofs.ts` relies on this order; keep the two in
step if you change the circuit signatures.

## Toolchain

From the repo root:

```bash
npm run circuit:setup   # installs nargo 1.0.0-beta.9 via noirup
npm run circuit:test    # nargo test in both circuits
npm run circuit:build   # compile both, copy to artifacts/noir, refresh SHA256SUMS
```

Proving in the browser downloads the Barretenberg CRS from `crs.aztec.network` on
first use, so the browser needs internet access.
