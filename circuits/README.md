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

## Recorded mainnet proof

The [mainnet evidence record](../docs/MAINNET-EVIDENCE.md) links one
maintainer-reported, wallet-confirmed bid delivery to its public `sealed_bid`
proof. The 14,592-byte proof was independently re-verified with the committed
artifact and `@aztec/bb.js` `0.87.0` using `{ keccak: true }`.

Its public inputs bind the mainnet auction tag, a lower bound of **11**, an
upper bound of **1,100**, and the commitment, binding and nullifier in the
302-byte delivery memo. The creation form starts with a **10 ZEC** reserve,
and the maintainer clarified that they chose **11** for this run. The title
retains the starting 10 ZEC value; the configured reserve and proof lower bound
record 11. The memo's proof commitment also matches a recomputation from the
proof bytes and public inputs.

The [saved evidence](../docs/evidence/mainnet-bid-2026-10-23.json) and
[reproduction command](../docs/MAINNET-EVIDENCE.md#reproduce-the-proof-check)
allow verification without relying on the live board. Proof validity establishes
bid admissibility; confirming shielded payment receipt remains a wallet check.

## Toolchain

From the repo root:

```bash
npm run circuit:setup   # installs nargo 1.0.0-beta.9 via noirup
npm run circuit:test    # nargo test in both circuits
npm run circuit:build   # compile both, copy to artifacts/noir, refresh SHA256SUMS
```

Proving in the browser downloads the Barretenberg CRS from `crs.aztec.network` on
first use, so the browser needs internet access.

## Prove from the command line

Proving is not browser-only. With `nargo` (`1.0.0-beta.9`) and Barretenberg
`bb` (`0.87.0`) installed, you can solve a witness and produce a real UltraHonk
proof from a shell — handy for CI, for reproducing a proof outside the app, and
for checking the verifier independently of the vendored `bb.js` bundle. Example
inputs live in each circuit's `Prover.toml`; `open_bid`'s reveals the bid that
`sealed_bid`'s seals, so the two round-trip.

```bash
cd circuits/sealed_bid
nargo execute witness   # solves target/witness.gz from Prover.toml

bb prove    -s ultra_honk -b ./target/sealed_bid.json -w ./target/witness.gz -o ./target --oracle_hash keccak
bb write_vk -s ultra_honk -b ./target/sealed_bid.json                        -o ./target --oracle_hash keccak
bb verify   -s ultra_honk -k ./target/vk -p ./target/proof -i ./target/public_inputs --oracle_hash keccak
# -> Proof verified successfully   (the proof is 14,592 bytes)
```

`--oracle_hash keccak` matches the app, which proves with `{ keccak: true }` so a
proof is checkable by an EVM-style verifier. For `open_bid`, swap in
`open_bid.json`.

Two gotchas worth knowing: `bb` extracts the bytecode with `jq`, so `jq` must be
on `PATH`; and `bb` is unhappy reading its inputs from a Windows drive mount, so
run it on a native Linux filesystem (a WSL home directory, not `/mnt/c`).
