import { describe, it, expect, beforeAll } from "vitest";
import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";
import sealedCircuit from "@/artifacts/noir/sealed_bid.json";
import openCircuit from "@/artifacts/noir/open_bid.json";

/**
 * Circuit ↔ model parity.
 *
 * The compiled ACIR in `artifacts/noir/` and the TypeScript rules the rest of
 * the app relies on are two implementations of the same specification. If a
 * circuit edit silently changes a bound, drops `currency` from the commitment,
 * or lets the nullifier depend on the amount, the product keeps compiling and
 * the unit tests keep passing while the two quietly diverge.
 *
 * This test closes that gap: it executes the real artifacts across a grid of
 * witnesses and asserts, for every point, that the circuit agrees with an
 * independent TS oracle on two things:
 *   1. satisfiability — exactly the admissibility rule, no more, no less;
 *   2. data flow — which inputs are allowed to change which public outputs.
 *
 * It runs under `npm test` (vitest, node env): witness solving happens in the
 * NoirJS ACVM and needs neither a browser nor Barretenberg.
 */

const SEALED = sealedCircuit as unknown as CompiledCircuit;
const OPEN = openCircuit as unknown as CompiledCircuit;

// Field inputs are hex; compare by value so padding/leading zeros never matter.
const big = (h: string): bigint => BigInt(h.startsWith("0x") ? h : `0x${h}`);
const key = (h: string): string => big(h).toString();

let sealed: Noir;
let open: Noir;
let executions = 0;

beforeAll(async () => {
  sealed = new Noir(SEALED);
  open = new Noir(OPEN);
  // Older NoirJS needs an explicit init; newer initializes lazily on execute.
  for (const n of [sealed, open]) {
    const maybeInit = (n as unknown as { init?: () => Promise<void> }).init;
    if (typeof maybeInit === "function") await maybeInit.call(n);
  }
}, 120_000);

type SealedInput = { bid: number; blinding: string; secret: string; currency: string; min: number; max: number };
type SealedOut = { commitment: string; binding: string; nullifier: string };

async function runSealed(i: SealedInput): Promise<SealedOut | null> {
  executions += 1;
  try {
    const { returnValue } = await sealed.execute({
      bid: i.bid,
      blinding: i.blinding,
      bidder_secret: i.secret,
      currency: i.currency,
      min_reserve: i.min,
      max_bound: i.max,
    });
    const rv = returnValue as unknown as string[];
    return { commitment: rv[0], binding: rv[1], nullifier: rv[2] };
  } catch {
    return null; // an assertion failed: the witness is unsatisfiable
  }
}

async function runOpen(i: { secret: string; blinding: string; bid: number; currency: string; expected: string }): Promise<string | null> {
  executions += 1;
  try {
    const { returnValue } = await open.execute({
      bidder_secret: i.secret,
      blinding: i.blinding,
      bid: i.bid,
      currency: i.currency,
      expected_commitment: i.expected,
    });
    return Array.isArray(returnValue) ? (returnValue[0] as string) : (returnValue as unknown as string);
  } catch {
    return null;
  }
}

// The independent TS model of sealed_bid's assertions. Kept deliberately plain
// so it reads as the spec, not a transcription of the circuit.
function admissible(i: SealedInput): boolean {
  if (!(i.min > 0)) return false;
  if (!(i.min <= i.max)) return false;
  if (!(i.bid >= i.min)) return false;
  if (!(i.bid <= i.max)) return false;
  if (big(i.blinding) === BigInt(0)) return false;
  if (big(i.secret) === BigInt(0)) return false;
  if (big(i.currency) === BigInt(0)) return false;
  return true;
}

const NONZERO = { blinding: "0x07", secret: "0x09", currency: "0x05" } as const;

describe("sealed_bid satisfiability matches the admissibility oracle", () => {
  const bids = [0, 1, 2, 50, 99, 100, 101, 120, 125, 149, 150, 151, 200, 500, 1000];
  const bounds = [
    { min: 100, max: 150 },
    { min: 1, max: 1 },
    { min: 1, max: 1000 },
    { min: 5, max: 200 },
    { min: 50, max: 60 },
    { min: 0, max: 150 }, // min must be > 0
    { min: 200, max: 150 }, // inverted interval
    { min: 10, max: 10 },
  ];

  it("agrees on every (bid × bounds) point", async () => {
    for (const b of bounds) {
      for (const bid of bids) {
        const input: SealedInput = { bid, ...NONZERO, min: b.min, max: b.max };
        const sat = (await runSealed(input)) !== null;
        expect(
          sat,
          `bid=${bid} min=${b.min} max=${b.max}: circuit ${sat ? "SAT" : "UNSAT"} but oracle says ${admissible(input)}`,
        ).toBe(admissible(input));
      }
    }
  }, 120_000);

  it("rejects a zero blinding, secret, or currency even when the range is fine", async () => {
    const base: SealedInput = { bid: 120, ...NONZERO, min: 100, max: 150 };
    expect(await runSealed({ ...base, blinding: "0x00" })).toBeNull();
    expect(await runSealed({ ...base, secret: "0x00" })).toBeNull();
    expect(await runSealed({ ...base, currency: "0x00" })).toBeNull();
    expect(await runSealed(base)).not.toBeNull(); // control: the point is otherwise valid
  }, 120_000);
});

describe("sealed_bid data flow matches the spec", () => {
  const base: SealedInput = { bid: 120, ...NONZERO, min: 100, max: 150 };

  it("commitment = f(bid, blinding, currency); binding/nullifier = f(secret, currency)", async () => {
    const b = await runSealed(base);
    expect(b).not.toBeNull();
    const o = b!;

    // Within one proof the three outputs are domain-separated.
    expect(key(o.commitment)).not.toBe(key(o.binding));
    expect(key(o.binding)).not.toBe(key(o.nullifier));
    expect(key(o.commitment)).not.toBe(key(o.nullifier));

    // bid changes the commitment only.
    const bid = (await runSealed({ ...base, bid: 121 }))!;
    expect(key(bid.commitment)).not.toBe(key(o.commitment));
    expect(key(bid.binding)).toBe(key(o.binding));
    expect(key(bid.nullifier)).toBe(key(o.nullifier));

    // blinding changes the commitment only (hiding).
    const bl = (await runSealed({ ...base, blinding: "0x08" }))!;
    expect(key(bl.commitment)).not.toBe(key(o.commitment));
    expect(key(bl.binding)).toBe(key(o.binding));
    expect(key(bl.nullifier)).toBe(key(o.nullifier));

    // secret changes binding + nullifier, never the commitment.
    const se = (await runSealed({ ...base, secret: "0x0a" }))!;
    expect(key(se.commitment)).toBe(key(o.commitment));
    expect(key(se.binding)).not.toBe(key(o.binding));
    expect(key(se.nullifier)).not.toBe(key(o.nullifier));

    // currency is in all three preimages, so it moves everything.
    const cu = (await runSealed({ ...base, currency: "0x06" }))!;
    expect(key(cu.commitment)).not.toBe(key(o.commitment));
    expect(key(cu.binding)).not.toBe(key(o.binding));
    expect(key(cu.nullifier)).not.toBe(key(o.nullifier));
  }, 120_000);

  it("gives a distinct binding and nullifier for every (secret, currency) pair", async () => {
    const secrets = ["0x11", "0x12", "0x13", "0x14", "0x15"];
    const currencies = ["0x21", "0x22", "0x23", "0x24"];
    const bindings = new Set<string>();
    const nullifiers = new Set<string>();
    for (const secret of secrets) {
      for (const currency of currencies) {
        const out = await runSealed({ bid: 120, blinding: "0x07", secret, currency, min: 100, max: 150 });
        expect(out).not.toBeNull();
        bindings.add(key(out!.binding));
        nullifiers.add(key(out!.nullifier));
      }
    }
    const pairs = secrets.length * currencies.length;
    expect(bindings.size).toBe(pairs);
    expect(nullifiers.size).toBe(pairs);
  }, 120_000);
});

describe("open_bid parity, and agreement with sealed_bid", () => {
  it("opens only with the exact amount, blinding, and currency that were sealed", async () => {
    const seal = await runSealed({ bid: 120, ...NONZERO, min: 100, max: 150 });
    expect(seal).not.toBeNull();
    const expected = seal!.commitment;

    // Correct opening succeeds and reproduces the sealed binding (cross-circuit).
    const bindingOut = await runOpen({ secret: NONZERO.secret, blinding: NONZERO.blinding, bid: 120, currency: NONZERO.currency, expected });
    expect(bindingOut).not.toBeNull();
    expect(key(bindingOut!)).toBe(key(seal!.binding));

    // Wrong amount, blinding, or currency cannot open the same commitment.
    expect(await runOpen({ secret: NONZERO.secret, blinding: NONZERO.blinding, bid: 130, currency: NONZERO.currency, expected })).toBeNull();
    expect(await runOpen({ secret: NONZERO.secret, blinding: "0x08", bid: 120, currency: NONZERO.currency, expected })).toBeNull();
    expect(await runOpen({ secret: NONZERO.secret, blinding: NONZERO.blinding, bid: 120, currency: "0x06", expected })).toBeNull();

    // Zero witnesses are rejected here too.
    expect(await runOpen({ secret: "0x00", blinding: NONZERO.blinding, bid: 120, currency: NONZERO.currency, expected })).toBeNull();
    expect(await runOpen({ secret: NONZERO.secret, blinding: "0x00", bid: 120, currency: NONZERO.currency, expected })).toBeNull();
  }, 120_000);

  it("lets a different bidder's secret still open a public commitment, with a different binding", async () => {
    // The commitment does not bind the secret, so anyone who knows (amount,
    // blinding) can open it — but the returned binding is theirs, not the
    // sealer's, which is exactly how a copied reveal is detected downstream.
    const seal = await runSealed({ bid: 120, ...NONZERO, min: 100, max: 150 });
    const expected = seal!.commitment;
    const attacker = await runOpen({ secret: "0x0a", blinding: NONZERO.blinding, bid: 120, currency: NONZERO.currency, expected });
    expect(attacker).not.toBeNull();
    expect(key(attacker!)).not.toBe(key(seal!.binding));
  }, 120_000);
});

describe("coverage", () => {
  it("exercised a substantial grid of real circuit executions", () => {
    // Self-documenting: if a refactor quietly shrinks the grid, this trips.
    expect(executions).toBeGreaterThanOrEqual(150);
  });
});
