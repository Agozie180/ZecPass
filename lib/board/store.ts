import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { acceptSealedBid, createAuction, type Auction, type SealedBidRecord } from "@/lib/domain/auction";
import { ZCASH_NETWORK, type ZcashNetworkId } from "@/lib/zcash/config";
import testnetSeed from "./seed-data.testnet.json";

/**
 * The mainnet seed is imported when it is present, so a clone still builds and a
 * testnet run still works before anyone has generated one. A mainnet deploy
 * needs it: `npm run seed:board -- mainnet <your u1…>` writes it, and
 * `seed-data.test.ts` fails if a seed belongs to the other network.
 */
const mainnetSeed: unknown = await import("./seed-data.mainnet.json")
  .then((m) => m.default)
  .catch(() => null);

/**
 * The public auction board.
 *
 * A sealed bid is a commitment, not an amount. The board records only public
 * commitments plus the proof that each one is well-formed, so publishing a bid
 * reveals nothing about the price. An amount appears only in a reveal, which
 * carries a proof that it opens the commitment sealed earlier. Anyone can read
 * the board; the stored proofs are checked in each visitor's own browser, so
 * the server never has to be trusted with the checking.
 *
 * Storage is one JSON file. It prefers `data/board.json`, falls back to the OS
 * temp dir on a read-only/serverless filesystem, and finally to an in-memory
 * copy — so a one-click deploy never crashes. Reads fall back to the committed
 * demo seed. The board is a demo surface, not a system of record; swap these two
 * functions for a database and nothing else changes.
 *
 * Each network keeps its own board and seed. The network is mixed into every
 * proof's currency tag, so a testnet bid can never verify on mainnet; separate
 * storage keeps a local testnet run from writing to the live mainnet board.
 */

const PRIMARY_PATH = path.join(process.cwd(), "data", `board.${ZCASH_NETWORK.id}.json`);
const FALLBACK_PATH = path.join(os.tmpdir(), `zecpass-board.${ZCASH_NETWORK.id}.json`);

// On a serverless host a disk is not shared between instances, so for a real
// shared board set a KV store: Vercel KV or Upstash Redis (either env pair).
// Without it, the board still works per-instance via the paths above.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KV_KEY = `zecpass:board:${ZCASH_NETWORK.id}:v1`;
const kvEnabled = Boolean(KV_URL && KV_TOKEN);

const SEEDS: Record<ZcashNetworkId, unknown> = {
  // A mainnet deploy without its seed would serve testnet proofs, which cannot
  // verify there; the empty board makes that visible instead of misleading.
  mainnet: mainnetSeed ?? { auctions: [] },
  testnet: testnetSeed,
};

async function kvGet(): Promise<Board | null> {
  try {
    const res = await fetch(`${KV_URL}/get/${KV_KEY}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data.result) return null;
    const parsed = JSON.parse(data.result) as Board;
    return parsed && Array.isArray(parsed.auctions) ? parsed : null;
  } catch {
    return null;
  }
}

async function kvSet(board: Board): Promise<boolean> {
  try {
    const res = await fetch(`${KV_URL}/set/${KV_KEY}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: JSON.stringify(board),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Caps keep a public, unauthenticated board from becoming a dumping ground. */
const MAX_AUCTIONS = 500;
const MAX_SEALED_BIDS = 200;
const MAX_REVEALS = 200;
const MAX_PROOF_HEX = 200_000;

export type BoardSealedBid = SealedBidRecord & {
  /** The UltraHonk proof that the bid is in range, kept so anyone can re-check it. */
  proofHex: string;
  publicInputs: string[];
};

export type BoardReveal = {
  auctionId: string;
  commitment: string;
  /** The disclosed amount. Public from the moment of reveal. */
  amount: number;
  bidderBinding: string;
  proofHex: string;
  publicInputs: string[];
  revealedAt: string;
};

export type BoardAuction = Auction & {
  createdAt: string;
  sealedBids: BoardSealedBid[];
  reveals: BoardReveal[];
};

/** What the index page needs: the auction plus how many bids and reveals it has. */
export type AuctionSummary = Omit<BoardAuction, "sealedBids" | "reveals"> & {
  sealedCount: number;
  revealedCount: number;
};

type Board = { auctions: BoardAuction[] };

// Last-resort store when no filesystem location is writable (locked-down
// serverless): persists for the warm instance's lifetime.
let memoryBoard: Board | null = null;

async function readStored(): Promise<Board | null> {
  if (kvEnabled) return kvGet();
  for (const p of [PRIMARY_PATH, FALLBACK_PATH]) {
    try {
      const parsed = JSON.parse(await fs.readFile(p, "utf8")) as Board;
      if (parsed && Array.isArray(parsed.auctions)) return parsed;
    } catch {
      // Not here — try the next location.
    }
  }
  return memoryBoard;
}

async function readBoard(): Promise<Board> {
  // Nothing stored yet: start from the committed demo seed (real, verifiable
  // proofs) so the board is populated on first load. The first successful write
  // persists over it, after which the seed is no longer consulted.
  return (await readStored()) ?? structuredClone(SEEDS[ZCASH_NETWORK.id] as Board);
}

// Writes are serialised through one promise chain so two concurrent requests
// cannot clobber each other's read-modify-write.
let writeQueue: Promise<unknown> = Promise.resolve();

function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function writeBoard(board: Board): Promise<void> {
  memoryBoard = board; // keep the latest in memory as a guaranteed fallback
  if (kvEnabled && (await kvSet(board))) return;
  for (const p of [PRIMARY_PATH, FALLBACK_PATH]) {
    try {
      await fs.mkdir(path.dirname(p), { recursive: true });
      const tmp = `${p}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(board, null, 2), "utf8");
      await fs.rename(tmp, p);
      return;
    } catch {
      // Not writable here — try the next location; memory already holds it.
    }
  }
}

export async function listAuctions(): Promise<AuctionSummary[]> {
  const board = await readBoard();
  return board.auctions
    .map(({ sealedBids, reveals, ...auction }) => ({
      ...auction,
      sealedCount: sealedBids.length,
      revealedCount: reveals.length,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getAuction(id: string): Promise<BoardAuction | null> {
  const board = await readBoard();
  return board.auctions.find((a) => a.id === id) ?? null;
}

export type CreateAuctionInput = Omit<Auction, "id"> & { id?: string };

export async function createAuctionRecord(input: CreateAuctionInput): Promise<BoardAuction> {
  // `createAuction` validates the parameters and derives a stable id.
  const auction = createAuction(input);
  return withWriteLock(async () => {
    const board = await readBoard();
    if (board.auctions.some((a) => a.id === auction.id)) {
      throw new Error(`An auction with id "${auction.id}" already exists.`);
    }
    if (board.auctions.length >= MAX_AUCTIONS) throw new Error("The board is full.");
    const record: BoardAuction = { ...auction, createdAt: new Date().toISOString(), sealedBids: [], reveals: [] };
    board.auctions.push(record);
    await writeBoard(board);
    return record;
  });
}

export type AddSealedBidInput = Omit<BoardSealedBid, "auctionId">;

/** Publish a sealed bid. The commitment/binding/nullifier must be unique; no amount is stored. */
export async function appendSealedBid(
  auctionId: string,
  bid: AddSealedBidInput,
): Promise<{ ok: true; bid: BoardSealedBid } | { ok: false; reason: string }> {
  if (bid.proofHex.length > MAX_PROOF_HEX) return { ok: false, reason: "Proof is too large." };
  return withWriteLock(async () => {
    const board = await readBoard();
    const auction = board.auctions.find((a) => a.id === auctionId);
    if (!auction) return { ok: false, reason: `Unknown auction "${auctionId}".` };
    if (auction.sealedBids.length >= MAX_SEALED_BIDS) return { ok: false, reason: "This auction has reached its bid limit." };

    const record: BoardSealedBid = { ...bid, auctionId };
    // `acceptSealedBid` enforces per-bidder and per-commitment uniqueness; the
    // board records the same objects, just with the proof kept alongside.
    const admission = acceptSealedBid(auction.sealedBids, record, record.submittedAt);
    if (!admission.ok) return admission;

    auction.sealedBids = admission.bids as BoardSealedBid[];
    await writeBoard(board);
    return { ok: true, bid: record };
  });
}

export type AddRevealInput = {
  commitment: string;
  amount: number;
  bidderBinding: string;
  proofHex: string;
  publicInputs: string[];
};

/**
 * Publish a reveal. The board does not judge whether the proof is valid — it
 * stores the proof and each visitor verifies it in their own browser — but it
 * does enforce that the reveal names a commitment sealed for this auction.
 */
export async function appendReveal(
  auctionId: string,
  reveal: AddRevealInput,
): Promise<{ ok: true; reveal: BoardReveal } | { ok: false; reason: string }> {
  if (reveal.proofHex.length > MAX_PROOF_HEX) return { ok: false, reason: "Proof is too large." };
  return withWriteLock(async () => {
    const board = await readBoard();
    const auction = board.auctions.find((a) => a.id === auctionId);
    if (!auction) return { ok: false, reason: `Unknown auction "${auctionId}".` };
    if (auction.reveals.length >= MAX_REVEALS) return { ok: false, reason: "This auction has reached its reveal limit." };
    if (!auction.sealedBids.some((b) => b.commitment === reveal.commitment)) {
      return { ok: false, reason: "No sealed bid on this auction has that commitment." };
    }
    if (auction.reveals.some((r) => r.commitment === reveal.commitment)) {
      return { ok: false, reason: "That bid has already been revealed." };
    }

    const record: BoardReveal = { ...reveal, auctionId, revealedAt: new Date().toISOString() };
    auction.reveals.push(record);
    await writeBoard(board);
    return { ok: true, reveal: record };
  });
}
