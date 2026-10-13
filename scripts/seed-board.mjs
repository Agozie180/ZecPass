// Generate a committed demo board (lib/board/seed-data.json) with REAL,
// in-browser-verifiable sealed-bid and reveal proofs, so the public board is
// alive on first load with nothing to set up.
//
// Every proof here is produced by the actual sealed_bid / open_bid circuits and
// verified before being written, and every derivation (currency tag, field
// normalisation, proof commitment) mirrors lib/proof/auction-proofs.ts exactly,
// so these records verify in the browser against the same artifacts.
//
// Run: npm run seed:board   (regenerates lib/board/seed-data.json; TESTNET)
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { bech32m } from "@scure/base";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NETWORK = "testnet"; // must match the app's runtime network for the currency tag
const BN254 = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

const sealedCircuit = JSON.parse(readFileSync(join(root, "artifacts/noir/sealed_bid.json"), "utf8"));
const openCircuit = JSON.parse(readFileSync(join(root, "artifacts/noir/open_bid.json"), "utf8"));

const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const bytesToHex = (b) => Buffer.from(b).toString("hex");
const norm64 = (v) => {
  const c = (String(v).startsWith("0x") ? String(v).slice(2) : String(v)).toLowerCase().replace(/^0+/, "") || "0";
  return c.padStart(64, "0");
};
function fieldHexFromString(input) {
  const v = BigInt(`0x${sha256hex(input)}`) % BN254;
  return (v === 0n ? 1n : v).toString(16).padStart(64, "0");
}
const currencyField = (auctionId) => `0x${fieldHexFromString(`auction|${NETWORK}|${auctionId}`)}`;
const randomSecret = () => `0x${randomBytes(31).toString("hex")}`;
const sellerAddress = (seed) => bech32m.encode("utest", Array.from({ length: 100 }, (_, i) => (i * seed + 5) % 32), false);

const sealedBackend = new UltraHonkBackend(sealedCircuit.bytecode, { threads: 1 });
const openBackend = new UltraHonkBackend(openCircuit.bytecode, { threads: 1 });
const sealedNoir = new Noir(sealedCircuit);
const openNoir = new Noir(openCircuit);

async function sealBid({ auctionId, bid, minReserve, maxBound, submittedAt }) {
  const secret = randomSecret();
  const blinding = randomSecret();
  const currency = currencyField(auctionId);
  const { witness, returnValue } = await sealedNoir.execute({
    bid, blinding, bidder_secret: secret, currency, min_reserve: minReserve, max_bound: maxBound,
  });
  const proofData = await sealedBackend.generateProof(witness, { keccak: true });
  if (!(await sealedBackend.verifyProof(proofData, { keccak: true }))) throw new Error(`seed sealed proof failed to verify (bid ${bid})`);
  const [commitment, bidderBinding, nullifier] = returnValue.map(norm64);
  const proofHex = bytesToHex(proofData.proof);
  const piCommit = sha256hex(`public-inputs|${proofData.publicInputs.join("|")}`);
  const proofCommitment = sha256hex(`ultrahonk|sealed|${proofHex}|${piCommit}`);
  return {
    record: { auctionId, commitment, bidderBinding, nullifier, proofCommitment, submittedAt, proofHex, publicInputs: proofData.publicInputs },
    secret, blinding, bid,
  };
}

async function revealBid({ auctionId, sealed, revealedAt }) {
  const currency = currencyField(auctionId);
  const { witness, returnValue } = await openNoir.execute({
    bidder_secret: sealed.secret, blinding: sealed.blinding, bid: sealed.bid, currency,
    expected_commitment: `0x${sealed.record.commitment}`,
  });
  const proofData = await openBackend.generateProof(witness, { keccak: true });
  if (!(await openBackend.verifyProof(proofData, { keccak: true }))) throw new Error(`seed reveal proof failed to verify (bid ${sealed.bid})`);
  return {
    auctionId,
    commitment: sealed.record.commitment,
    amount: sealed.bid,
    bidderBinding: norm64(returnValue),
    proofHex: bytesToHex(proofData.proof),
    publicInputs: proofData.publicInputs,
    revealedAt,
  };
}

const HOUR = 3600_000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

// Three exhibits: a settled Vickrey, a settled first-price, and one still open.
const PLAN = [
  {
    id: "rare-shielded-note", title: "Rare shielded note (NU5 genesis)",
    description: "A collectible shielded note. Second-price: bid your true value.",
    reservePrice: 30, bound: 1000, pricingRule: "vickrey", seedN: 7,
    opens: now - 72 * HOUR, closes: now - 2 * HOUR,
    bids: [{ amount: 40, reveal: false }, { amount: 85, reveal: true }, { amount: 60, reveal: true }],
  },
  {
    id: "short-zec-domain", title: "Short .zec handle: \"pay\"",
    description: "A three-letter payment handle. First-price, winner pays their bid.",
    reservePrice: 100, bound: 5000, pricingRule: "first-price", seedN: 11,
    opens: now - 96 * HOUR, closes: now - 5 * HOUR,
    bids: [{ amount: 250, reveal: true }, { amount: 400, reveal: true }],
  },
  {
    id: "priority-relay-slot", title: "Priority relay slot (next epoch)",
    description: "A block of priority relay capacity. Bidding is open — seal yours.",
    reservePrice: 10, bound: 500, pricingRule: "vickrey", seedN: 19,
    opens: now - 6 * HOUR, closes: now + 72 * HOUR,
    bids: [{ amount: 22, reveal: false }, { amount: 35, reveal: false }, { amount: 50, reveal: false }],
  },
];

const auctions = [];
for (const p of PLAN) {
  console.log(`[seed] ${p.id}: ${p.bids.length} bids`);
  const sealedBids = [];
  const reveals = [];
  let t = p.opens + HOUR;
  for (const b of p.bids) {
    const sealed = await sealBid({ auctionId: p.id, bid: b.amount, minReserve: p.reservePrice, maxBound: p.bound, submittedAt: iso(t) });
    sealedBids.push(sealed.record);
    if (b.reveal) reveals.push(await revealBid({ auctionId: p.id, sealed, revealedAt: iso(p.closes + HOUR) }));
    t += 3 * HOUR;
  }
  auctions.push({
    id: p.id, title: p.title, description: p.description,
    reservePrice: p.reservePrice, currency: "ZEC", pricingRule: p.pricingRule,
    bidOpensAt: iso(p.opens), bidClosesAt: iso(p.closes), sellerAddress: sellerAddress(p.seedN),
    createdAt: iso(p.opens - HOUR), sealedBids, reveals,
  });
}

await sealedBackend.destroy();
await openBackend.destroy();

const out = join(root, "lib/board/seed-data.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ auctions }, null, 2)}\n`, "utf8");
console.log(`[seed] wrote ${auctions.length} auctions, ${auctions.reduce((n, a) => n + a.sealedBids.length, 0)} sealed bids, ${auctions.reduce((n, a) => n + a.reveals.length, 0)} reveals -> ${out}`);
