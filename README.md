# ZecPass — sealed-bid auctions on Zcash, where the price is public and the bidders are not

[![CI](https://github.com/Agozie180/ZecPass/actions/workflows/ci.yml/badge.svg)](https://github.com/Agozie180/ZecPass/actions/workflows/ci.yml)
![tests](https://img.shields.io/badge/tests-63%20passing-brightgreen)
![circuits](https://img.shields.io/badge/circuits-nargo%207%2F7%20%2B%205%2F5-brightgreen)
![proofs](https://img.shields.io/badge/proofs-Noir%20%2B%20UltraHonk-7b3fe4)
![network](https://img.shields.io/badge/live%20demo-Zcash%20mainnet-f4b728)
![license](https://img.shields.io/badge/license-MIT-black)

**Links:** [Live demo (Zcash mainnet)](https://zec-pass.vercel.app) · [60‑second demo](DEMO.md) · [Why this wins](docs/WHY-THIS-WINS.md) · [Security notes](docs/SECURITY.md) · [Deploy your own](#deploy-a-live-demo-in-one-click) · Built for the **Zcash "Zecathon" — Private Markets track**

> **A sealed bid is a zero-knowledge proof: it clears the reserve, it is well-formed, and it cannot be claimed twice — and the amount never leaves the bidder's browser.**

ZecPass runs a sealed-bid auction on Zcash. A bidder proves, in their own browser, that their bid is admissible without revealing it. The sealed bid is published to a shared public board as a commitment, and delivered to the seller inside a shielded Zcash memo. After bidding closes, a bidder reveals their amount with a second proof that it genuinely opens the commitment they sealed. Settlement is a shielded payment.

Two privacy layers do two different jobs, and removing either breaks the design:

- **UltraHonk hides the price.** `sealed_bid` proves `reserve ≤ bid ≤ bound` without revealing the bid and emits a per-auction nullifier so one bidder cannot stuff the ballot; `open_bid` proves a revealed amount opens the sealed commitment.
- **Zcash hides the participants.** Bids reach the seller as a ZIP‑321 request carrying a ZIP‑302 memo; settlement is a shielded payment. Transparent addresses are rejected.

## How it works

```mermaid
flowchart LR
  B([Bidder]) -- "bid (private)" --> P[sealed_bid proof<br/>in the browser]
  P -- "commitment + proof<br/>(no amount)" --> Board[(Public board)]
  P -- "ZIP-321 + ZIP-302<br/>shielded memo" --> S([Seller])
  Board -- "anyone re-verifies<br/>in their own browser" --> V{{proof valid?}}
  B -- "reveal: open_bid proof" --> Board
  Board --> Settle[Settlement<br/>first-price / Vickrey]
  Settle -- "shielded payment" --> S
```

1. A seller opens an auction with a public reserve, a pricing rule (first-price or second-price / Vickrey) and a bidding window.
2. A bidder enters an amount — nothing leaves the browser. A Noir circuit, proved with Barretenberg UltraHonk in the browser, shows the bid is in range.
3. The sealed bid — commitment, binding, nullifier and the proof, **never the amount** — is published to the board and delivered to the seller in a shielded ZIP‑321 request.
4. Anyone opens the board and re-checks a sealed bid's proof in their own browser. The server is never trusted with the checking.
5. After bidding closes, a bidder reveals with an `open_bid` proof that the amount opens their commitment. Settlement pays the clearing price to the seller over a shielded payment.

Zcash has no smart contracts, so winner determination and verification happen off-chain, in the browser. That is the correct architecture for this chain, not a gap.

## What's used, and what's deliberately not

| Sponsor surface | Used | Evidence, or the reasoned decision |
| --- | :---: | --- |
| Noir circuits (`sealed_bid`, `open_bid`) | ✅ | `circuits/`, `nargo test` 7/7 + 5/5 |
| Barretenberg UltraHonk (`@aztec/bb.js`) | ✅ | real prove **and** verify in-browser (`lib/proof/auction-proofs.ts`) |
| ZIP‑321 payment requests | ✅ | bid delivery request with a scannable QR (`lib/zcash/zip321.ts`); the settlement request is built and tested in `lib/zcash/sealed-bid.ts` but not yet shown in the UI |
| ZIP‑302 text memo | ✅ | sealed-bid envelope, 287 of 512 bytes (`lib/zcash/sealed-bid.ts`) |
| Unified + Sapling shielded addresses | ✅ | checksum-validated in the browser **and** on the server, per network; transparent addresses rejected (`lib/zcash/address.ts`) |
| Zcash mainnet | ✅ | the live demo runs on mainnet: a delivery is a real shielded payment to the seller |
| Zcash smart contracts | ❌ | Zcash has none by design — verification and settlement are off-chain/in-browser |
| On-chain settlement confirmation | ❌ (reasoned) | no contract to read it; confirming a shielded payment needs the seller's viewing key + a light client (see `docs/SECURITY.md`) |

## The thesis, enforced (not asserted)

| The system decides | The system is structurally prevented from deciding |
| --- | --- |
| whether a bid is admissible — **by proof, not trust** | a bid below the reserve is **unprovable** (`assert(bid >= reserve)`) |
| whether a reveal is truthful — **by proof, not trust** | a reveal that does not open the sealed commitment is **unprovable** |
| — | the same bidder identity being counted twice on an auction (per-auction **nullifier**; one person may hold several identities — see [Security](docs/SECURITY.md)) |

You can watch all three refuse, live, in the Playground (`/playground`).

## Measured

| Claim | Value | Reproduce |
| --- | --- | --- |
| `sealed_bid` circuit tests | 7 / 7 pass | `npm run circuit:test` |
| `open_bid` circuit tests | 5 / 5 pass | `npm run circuit:test` |
| TypeScript unit tests | 63 pass | `npm test` |
| Sealed-bid proof size | ~14.6 KB | seal a bid in `/playground` |
| In-browser prove **+** verify | ~10–25 s cold, faster once the CRS caches | `/playground` |
| Full round trip (create → seal → board → re-verify → reveal → settle) | passes in a real browser, on testnet and mainnet builds | the [live demo](https://zec-pass.vercel.app), or `npm run dev` and walk it |
| Delivery memo | 287 of 512 bytes | the counter under "Shielded memo" after sealing |
| Delivery QR | decodes back to the exact ZIP‑321 request, at normal and enlarged size, light and dark theme | seal a bid and scan it with any Zcash wallet |
| Seed proofs carry the right network tag | checked for both networks on every test run | `npm test` (`lib/board/seed-data.test.ts`) |

## Run it

```bash
npm install          # postinstall vendors @aztec/bb.js into public/vendor
npm run dev          # http://localhost:3000 — testnet by default, no .env needed
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`. Proving fetches the Barretenberg CRS from `crs.aztec.network` on first use, so the browser needs internet.

### Networks

Local development runs on **testnet**, so it never touches real funds. The live demo runs on **mainnet**. The network is set at build time by `NEXT_PUBLIC_ZCASH_NETWORK`, and it decides three things:

- which shielded addresses are accepted (`u1…`/`zs1…` on mainnet, `utest1…`/`ztestsapling1…` on testnet), checked in the browser and again on the server;
- which seed and board storage are used (`lib/board/seed-data.<network>.json`, and a separate KV key per network), so a testnet run never writes to the mainnet board;
- the currency tag inside every proof, so a testnet bid can never verify as a mainnet one.

To regenerate a seed (every proof is generated and verified as it is written):

```bash
npm run seed:board                          # testnet
npm run seed:board -- mainnet <your u1…>    # mainnet: a shielded address you control
```

The mainnet seed needs a real address you control, because bids sent from the seeded auctions arrive there. The script refuses to run without one.

## Deploy a live demo in one click

**Live demo:** https://zec-pass.vercel.app (Zcash mainnet)

The Playground and the seeded board are fully client-side, so they work on any host; the board's write actions degrade gracefully on a read-only/serverless filesystem (temp dir, then in-memory). A one-click deploy runs on testnet; for mainnet, set `NEXT_PUBLIC_ZCASH_NETWORK=mainnet` in the project's environment variables and commit a mainnet seed made with your own address (see [Networks](#networks)).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Agozie180/ZecPass)

**Shared, persistent board on Vercel:** the live demo runs with Upstash for Redis connected, so posted bids are shared across visitors and serverless instances rather than living on one instance's disk. To set this up on your own deploy: in the Vercel dashboard → Storage, add **Upstash for Redis** (or Vercel KV) — it sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically; redeploy and the board uses them (it also accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). Without a KV store the Playground and the seeded board still work, but bids posted on a serverless host are per-instance and may not persist.

## The circuits

Both are Noir `1.0.0-beta.9`, proved and verified with UltraHonk. `sealed_bid` proves `reserve ≤ bid ≤ bound` and emits `commitment` / `bidder_binding` / `nullifier`; `open_bid` proves a revealed amount opens the commitment. Full detail and the public-input ordering are in [`circuits/README.md`](circuits/README.md).

## Layout

| Path | What is there |
| --- | --- |
| `app/` | landing, `/playground`, `/create`, `/auctions/[id]`, board API routes |
| `components/` | board, create form, auction room, playground, theme toggle |
| `lib/proof/` | browser UltraHonk proving, shared field primitives, per-browser secrets |
| `lib/zcash/` | network registry, address validation, ZIP‑302 memo, ZIP‑321, sealed-bid envelope |
| `lib/domain/` | auction model: lifecycle, first-price and Vickrey resolution |
| `lib/board/` | public board store + committed demo seed |
| `circuits/`, `artifacts/noir/` | the two circuits, tests, and compiled artifacts |

## Known limits (stated plainly)

Full detail in [`docs/SECURITY.md`](docs/SECURITY.md). In short: publishing a sealed bid to the board is a clearnet HTTP POST, so the board host sees the bidder's IP — the ZK hides the amount and Zcash hides the bidder→seller delivery, but board-level network anonymity needs Tor; there is no deposit/escrow and reveal is voluntary; the board cannot confirm a settlement payment landed; the live demo is mainnet, so sending a delivery is a real payment (0.0001 ZEC plus the network fee), and the seeded auctions carry a placeholder seller address that no wallet controls — only deliver to an auction you opened with your own address; nothing is audited.

## For judges

Start with [`DEMO.md`](DEMO.md). There are two ways in, and the first needs nothing installed.

**No wallet (about a minute).** Open the [live demo](https://zec-pass.vercel.app/playground), seal a bid, then **try to cheat** (bid below the reserve, or reveal a different number) and watch the circuit refuse. On the board at `/`, verify any sealed bid's proof in your own browser, then reveal and settle. To see what the seller receives without sending anything, seal a bid and click **Proof bundle**: the `memo` field is the exact text the shielded payment carries — auction id, commitment, binding, nullifier and proof commitment, and no amount.

**With a mainnet Zcash wallet (about two minutes, costs only the network fee).** Click **Open an auction**, and use **your own** shielded address as the seller. Seal a bid, scan the QR with your wallet, and send it from your shielded balance. You are paying yourself 0.0001 ZEC, so only the fee is spent. Open the received transaction in your wallet: its memo starts with `ZECBID1|` and carries the same commitment you see on the board. The bid reached the seller over Zcash, and a block explorer shows the transaction with its sender, receiver, amount and memo all hidden.

The case against the four judging axes is in [`docs/WHY-THIS-WINS.md`](docs/WHY-THIS-WINS.md).

## License

MIT
