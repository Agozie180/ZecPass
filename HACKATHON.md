# Zecathon notes

Facts from thezecathon.com and the organiser rules the user pasted:

- Zcash privacy hackathon. Submission deadline Oct 28 (≈18 days left as of Oct 12).
- $100k total: five tracks at $15k, a $20k grand prize, $5k bounties.
- One person registers and submits. One submission per account, in exactly one track.
- All code written during the build window. Libraries are fine; existing products are not.
- Open source at submission (a private repo made public on Oct 28 counts).
- Submissions are sealed until judging. Edits allowed until the deadline.

## Our entry

**Track: Private Markets** — "the dark-pool thesis: sealed-bid auctions, order
flow, settlement, anything where the price should be public and the participants
should not."

ZecPass is a sealed-bid auction on Zcash. UltraHonk (Aztec's Noir prover, used as
a library) hides the bid amount; Zcash hides the participant via shielded
delivery; a public board makes the sealed commitments auditable by anyone.

## Scoring

- **Privacy**: does it actually preserve privacy? Leaks are disqualifying, not deductions.
- **Usefulness**: would someone use it on Monday.
- **Execution**: does it run. Working beats ambitious.
- **Originality**: built for this hackathon, not repackaged.

## Reference reading (verified this session)

- **librustzcash** — Zcash's own stack: `zcash_primitives`, `zcash_proofs` (Sprout),
  `sapling-crypto`, `orchard`, `zcash_address`, `zip321`, `zcash_keys`,
  `zcash_client_backend`. Zcash's own zero-knowledge is **Groth16** (Sapling) and
  **Halo 2** (Orchard). It does **not** use Noir/Barretenberg/UltraHonk — those are
  Aztec's. So in ZecPass, Zcash is the private channel and the public-commitment
  surface; the ZK is Aztec's, used as an allowed library.
- **ZIPs**: 321 (payment requests, active) and 302 (memo format, draft) are what we
  use; 316 (unified addresses), 231 (memo bundles), 307 (light client payment
  detection) are relevant for the settlement-confirmation gap.
- **NEAR Intents** — cross-chain swaps (1-Click API, TS SDK). Relevant only if the
  auction ever needs cross-chain settlement; not used now.
- **Zodl** — Zcash wallets/SDKs are Rust/Kotlin/Swift; there is no official web/TS
  SDK, which is why the Zcash pieces here are built on the specs directly.

## Risks to settle before submitting

1. **Originality / provenance (resolved).** The auction concept, both Noir
   circuits, the domain model, the board and the whole UI were written in this
   build window. The Zcash utility modules (`lib/zcash/{bech32,address,memo,zip321,config}`)
   were re-authored from scratch during the window too — a registry-driven
   network/address model that replaces the carried-over code, with the dead
   reputation-era helpers removed. Nothing is carried over verbatim; all
   `lib/zcash` tests are new.
2. **The biggest privacy question: the board post.** The ZK hides the amount and
   Zcash hides the bidder→seller delivery, but publishing a sealed bid is a
   clearnet HTTP POST, so the board host sees the bidder's IP. "Leaks are
   disqualifying." Decide the framing/mitigation (Tor guidance is in
   `docs/SECURITY.md`; consider making the board post the explicitly non-private
   step, or routing it through the shielded channel too).
3. **Usefulness / trust model.** No deposit or escrow (the range proof does not
   prove the bidder can pay), reveal is voluntary, and the board cannot confirm
   settlement landed. Decide how much of this to build vs. disclose.
4. **Execution.** Browser proving is verified end-to-end (real proof generated and
   verified in a headless browser). Still needed: the full create→seal→board→
   reveal→settle round trip exercised live, a real testnet wallet test, and a
   demo video.
