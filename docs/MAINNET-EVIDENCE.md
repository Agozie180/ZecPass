# Mainnet bid evidence

On **2026-10-23**, the maintainer reported completing one Zcash mainnet auction
bid and confirming its transaction in their wallet. They supplied the transaction
ID, memo and two addresses below. The memo matches the live public board, and
the published `sealed_bid` proof was independently re-verified with the
repository's circuit artifact and Barretenberg `0.87.0`.

This records a completed manual bid-delivery check. The wallet confirmation is
reported by the maintainer; the reproducible checks below cover the public bid
and proof. The application still has no automatic payment confirmation.

## Transaction and auction

| Field | Recorded value |
| --- | --- |
| Network | Zcash mainnet |
| Report date | 2026-10-23; this is not an asserted block timestamp |
| Transaction ID supplied by the maintainer | `2b15d7c280c9f44e1a4f5266c290c7cd547a34427219e0dc9e78c1a277ff498a` |
| Auction ID | `sealed-note-10-zec-reserve-1y0lvlb` |
| Auction title | Sealed note, 10 ZEC reserve |
| Starting reserve | **10 ZEC**, the form default and the minimum described by the maintainer |
| Chosen value / configured reserve / proof lower bound | **11**, in the auction's ZEC display units |
| Proof upper bound | 1,100, in the same display units |
| Pricing rule | Vickrey (second price) |
| Board submission time | `2026-10-23T14:48:33.941Z` |
| Public board retrieved | `2026-10-23T19:25:02.870Z` |
| Memo size | **302 UTF-8 bytes**, within ZIP-302's 512-byte limit |
| Sealed-bid proof size | 14,592 bytes |

The maintainer clarified that the starting minimum was **10 ZEC** and they
chose **11**. The creation form defaults to a reserve of 10; this auction's
saved `reservePrice` and the proof's public lower bound record the chosen value
of 11. The title and ID retain the starting “10 ZEC reserve” text. The form's
default is configurable, rather than a fixed protocol minimum. Neither the
title nor the memo discloses the sealed bid amount.

[Open the auction](https://zec-pass.vercel.app/auctions/sealed-note-10-zec-reserve-1y0lvlb)
or inspect its [public API response](https://zec-pass.vercel.app/api/auctions/sealed-note-10-zec-reserve-1y0lvlb).
The [saved public evidence](evidence/mainnet-bid-2026-10-23.json) preserves the
matching bid, proof and public inputs so verification does not depend on the
live board retaining them. No reveals were present when the board was checked.

## Exact memo

```text
ZECBID1|sealed-note-10-zec-reserve-1y0lvlb|035070848f4c7126c41d60dedbdd596c1995cf5e6ecde40bae62005820b9bc03|15ee032195c37583e39ba72e72f824aa4b4ff33d69010396d50100122486832a|2a556f21f57baa1ccb676cd4bec061b9f16ec5c955d760f5bb042eec9a3dc5d3|3d0ae71a6ada63bf748a16a99cc4750be1c52556f4848d60fb558578b0cec2bb
```

The field order is defined in [`lib/zcash/sealed-bid.ts`](../lib/zcash/sealed-bid.ts):

| Position | Meaning |
| --- | --- |
| 1 | `ZECBID1`: sealed-bid delivery envelope |
| 2 | Auction ID |
| 3 | Bid commitment |
| 4 | Bidder binding |
| 5 | Per-auction nullifier |
| 6 | Proof commitment: hash binding the proof bytes and public inputs |

The memo carries public identifiers and commitments. It contains neither the
private bid amount nor the proof bytes. The full proof is on the public board
and in the saved evidence.

## Addresses and their roles

**Seller address.** The first address supplied by the maintainer exactly matches
the live auction's `sellerAddress`, which the application uses in its delivery
payment request:

```text
u1d6nmjeetlm0lpsw4nnsre2a4t5yrq5k83zrpaqnf76qkqtyaz2z7jhv4mestum3wjspcm3ygu3rm74f4lfa0ukhjvcrf8pp4quq6m77e
```

**Wallet confirmation address.** The maintainer said they used this second
address to confirm the transaction in their wallet:

```text
u19q4eh3j90mq0xnncq99sru3yffpyzeaml7nn0nhrg0gvgeng604ev7udk054h9d2kwgk7ldjrvhz33gmpq8g9laujhplsen35xdezquq8qrn2a4996vu9fd5twluyta43s8sy3pmefcv74u7mq0jfum2cetj5wr3qvak8un54ualttsx
```

Both pass the application's mainnet Unified Address prefix and Bech32m checksum
checks. Those checks do not establish ownership, decode the receivers, or show
that the addresses belong to the same wallet. The second address is not assigned
a sender or receiver role by this evidence record.

These addresses, the memo and their association with the transaction ID are
published here at the maintainer's request. This voluntarily discloses a link
between this test transaction and the public auction. The information came from
the maintainer and the board; it was not decrypted from public chain data.

## Checks performed

- Parsed and rebuilt the memo with the application's own functions; all five
  fields match the corresponding public bid record.
- Checked both addresses with the application's mainnet address validator.
- Rebuilt the delivery request and decoded its memo back to the exact supplied
  text. The application's default envelope payment is **0.0001 ZEC**; this does
  not establish the actual amount sent in the reported transaction.
- Checked the proof's currency tag against `auction|mainnet|<auction ID>`, its
  lower bound against the configured reserve, and its three public outputs
  against the memo's commitment, binding and nullifier.
- Recomputed the proof commitment from the proof bytes and public inputs.
- Verified the 14,592-byte UltraHonk proof using
  [`artifacts/noir/sealed_bid.json`](../artifacts/noir/sealed_bid.json),
  `@aztec/bb.js` **0.87.0**, and `{ keccak: true }`. Verification returned `true`.

The public proof establishes bid admissibility. The transaction ID alone cannot
prove that its shielded memo matches the board, and no independent chain lookup
or wallet decryption was performed for this record. The wallet application,
confirmation count and block height were not supplied.

## Reproduce the proof check

From the repository root, after `npm install`, run this in Bash or WSL. It
creates a verification script under the ignored `.tooling/` directory:

```bash
mkdir -p .tooling
cat > .tooling/verify-mainnet-bid.mjs <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { UltraHonkBackend } from "@aztec/bb.js";

const evidence = JSON.parse(readFileSync("docs/evidence/mainnet-bid-2026-10-23.json", "utf8"));
const bid = evidence.sealedBid;
const sha = text => createHash("sha256").update(text, "utf8").digest("hex");
const inputsHash = sha(`public-inputs|${bid.publicInputs.join("|")}`);
assert.equal(sha(`ultrahonk|sealed|${bid.proofHex}|${inputsHash}`), bid.proofCommitment);
assert.equal(evidence.memo, ["ZECBID1", bid.auctionId, bid.commitment, bid.bidderBinding, bid.nullifier, bid.proofCommitment].join("|"));

const circuit = JSON.parse(readFileSync("artifacts/noir/sealed_bid.json", "utf8"));
const backend = new UltraHonkBackend(circuit.bytecode, { threads: 1 });
try {
  const valid = await backend.verifyProof({
    proof: Uint8Array.from(Buffer.from(bid.proofHex, "hex")),
    publicInputs: bid.publicInputs
  }, { keccak: true });
  assert.equal(valid, true);
  console.log("Memo matches the saved bid; proof commitment matches; sealed-bid proof valid.");
} finally {
  await backend.destroy();
}
JS
node .tooling/verify-mainnet-bid.mjs
```

This check uses the pinned upstream verifier described in
[Security notes](SECURITY.md#the-verifier-and-what-you-are-trusting). It does not
access a wallet or validate transaction inclusion. To repeat the manual delivery
check with your own wallet, follow [the demo guide](../DEMO.md#seal-and-deliver-your-own).

## Scope of the milestone

`ZECBID1` records bid delivery. Payment of an auction's clearing price uses the
separate `ZECSETTLE1` format; no completed settlement payment is established here.
The range proof does not prove available funds, reveal remains voluntary, and
the board still cannot confirm receipt of a shielded payment automatically.
The existing [security limits](SECURITY.md) continue to apply, including board
IP visibility and the absence of an audit.
