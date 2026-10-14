import sealedBidCircuit from "@/artifacts/noir/sealed_bid.json";
import openBidCircuit from "@/artifacts/noir/open_bid.json";
import type { CompiledCircuit } from "@noir-lang/noir_js";
import { ZCASH_NETWORK } from "@/lib/zcash/config";
import { getBidderSecret, getBidBlinding } from "@/lib/proof/bidder-secret";
import { bytesToHex, concatFieldBytes, fieldHexFromString, normalizeField, sha256Hex, toCircuitField } from "@/lib/proof/primitives";

/**
 * Browser proving for the sealed-bid auction circuits.
 *
 * `@aztec/bb.js` publishes its browser build as a prebuilt webpack bundle that
 * Next's own webpack cannot re-bundle (it throws "Object.defineProperty called
 * on non-object"). We vendor that bundle into `public/vendor/bb/` and load it as
 * a same-origin native ES module with `webpackIgnore`. Proving happens entirely
 * in this browser: the bid amount never leaves it.
 */
async function loadBarretenberg(): Promise<typeof import("@aztec/bb.js")> {
  const url = "/vendor/bb/index.js";
  return import(/* webpackIgnore: true */ url) as Promise<typeof import("@aztec/bb.js")>;
}

export type ProofProgress = (message: string) => void;

/** Field element the circuit takes as the public `currency` input for an auction. */
export async function currencyField(auctionId: string, networkId: string): Promise<string> {
  return fieldHexFromString(`auction|${networkId}|${auctionId}`);
}

function assertBrowserSupport() {
  if (typeof window === "undefined") throw new Error("Browser proving must run in a browser context.");
  if (typeof WebAssembly === "undefined") throw new Error("WebAssembly is not available in this browser.");
  if (!crypto?.subtle) throw new Error("Web Crypto subtle API is not available in this browser.");
}

function assertArtifact(compiled: CompiledCircuit, name: string) {
  if (!compiled || typeof compiled !== "object") throw new Error(`${name} ACIR artifact did not load.`);
  if (!compiled.bytecode || typeof compiled.bytecode !== "string") throw new Error(`${name} ACIR artifact is missing bytecode.`);
  if (!compiled.abi) throw new Error(`${name} ACIR artifact is missing ABI metadata.`);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return "Unknown browser proving error"; }
}

async function phase<T>(label: string, onProgress: ProofProgress | undefined, task: () => Promise<T>): Promise<T> {
  onProgress?.(label);
  try {
    return await task();
  } catch (error) {
    throw new Error(`${label} failed: ${describeError(error)}`);
  }
}

/** Prove a sealed bid: the amount and blinding stay private, the commitments go public. */
export type SealedBidProof = {
  commitment: string;
  bidderBinding: string;
  nullifier: string;
  proofBytesHex: string;
  publicInputs: string[];
  proofSizeBytes: number;
  proofCommitment: string;
};

export async function proveSealedBid(args: {
  auctionId: string;
  bid: number;
  minReserve: number;
  maxBound: number;
  allowOutOfRange?: boolean;
  bidderSecret?: string;
  blinding?: string;
  onProgress?: ProofProgress;
}): Promise<SealedBidProof> {
  assertBrowserSupport();
  if (!Number.isInteger(args.bid) || args.bid < 0) throw new Error("Bid must be a non-negative whole number.");
  if (args.minReserve > args.maxBound) throw new Error("The auction bounds are inverted.");
  // Normally we guard the range in JS for a fast, friendly message. The
  // playground sets `allowOutOfRange` to deliberately feed the circuit an
  // inadmissible bid and let the UltraHonk assertion be the one that refuses —
  // demonstrating that soundness lives in the math, not in this check.
  if (!args.allowOutOfRange) {
    if (args.bid < args.minReserve) throw new Error(`Bid must be at least the reserve of ${args.minReserve}.`);
    if (args.bid > args.maxBound) throw new Error(`Bid must not exceed the limit of ${args.maxBound}.`);
  }

  const compiled = sealedBidCircuit as CompiledCircuit;
  assertArtifact(compiled, "sealed_bid");

  const [{ Noir }, { UltraHonkBackend }] = await phase("Loading NoirJS and Barretenberg", args.onProgress, async () =>
    Promise.all([import("@noir-lang/noir_js"), loadBarretenberg()]),
  );

  const currency = await currencyField(args.auctionId, ZCASH_NETWORK.id);
  const noir = new Noir(compiled);
  await phase("Initializing sealed_bid circuit", args.onProgress, async () => {
    if (typeof noir.init === "function") await noir.init();
  });

  const { witness, returnValue } = await phase("Generating sealed bid witness", args.onProgress, async () =>
    noir.execute({
      bid: args.bid,
      blinding: toCircuitField(args.blinding ?? getBidBlinding(args.auctionId)),
      bidder_secret: toCircuitField(args.bidderSecret ?? getBidderSecret()),
      currency: toCircuitField(currency),
      min_reserve: args.minReserve,
      max_bound: args.maxBound,
    }),
  );

  if (!Array.isArray(returnValue) || returnValue.length !== 3) {
    throw new Error("sealed_bid did not return a commitment, binding and nullifier.");
  }
  const [commitment, bidderBinding, nullifier] = (returnValue as string[]).map((v) => normalizeField(String(v)).padStart(64, "0"));

  const backend = new UltraHonkBackend(compiled.bytecode, { threads: 1 });
  try {
    const proofData = await phase("Generating sealed bid proof", args.onProgress, async () => backend.generateProof(witness, { keccak: true }));
    const ok = await phase("Locally verifying sealed bid proof", args.onProgress, async () => backend.verifyProof(proofData, { keccak: true }));
    if (!ok) throw new Error("Sealed-bid proof failed local verification.");

    return await phase("Encoding sealed bid", args.onProgress, async () => {
      const proofBytesHex = bytesToHex(proofData.proof);
      const publicInputsCommitment = await sha256Hex(`public-inputs|${proofData.publicInputs.join("|")}`);
      const proofCommitment = await sha256Hex(`ultrahonk|sealed|${proofBytesHex}|${publicInputsCommitment}`);
      return {
        commitment,
        bidderBinding,
        nullifier,
        proofBytesHex,
        publicInputs: proofData.publicInputs,
        proofSizeBytes: proofData.proof.length,
        proofCommitment,
      };
    });
  } finally {
    await backend.destroy();
  }
}

/** Prove a reveal: the disclosed bid opens the commitment sealed earlier. */
export type OpenBidProof = {
  bidderBinding: string;
  proofBytesHex: string;
  publicInputs: string[];
  proofSizeBytes: number;
  proofCommitment: string;
};

export async function proveOpenBid(args: {
  auctionId: string;
  bid: number;
  commitment: string;
  bidderSecret?: string;
  blinding?: string;
  onProgress?: ProofProgress;
}): Promise<OpenBidProof> {
  assertBrowserSupport();
  if (!Number.isInteger(args.bid) || args.bid < 0) throw new Error("Bid must be a non-negative whole number.");

  const compiled = openBidCircuit as CompiledCircuit;
  assertArtifact(compiled, "open_bid");

  const [{ Noir }, { UltraHonkBackend }] = await phase("Loading NoirJS and Barretenberg", args.onProgress, async () =>
    Promise.all([import("@noir-lang/noir_js"), loadBarretenberg()]),
  );

  const currency = await currencyField(args.auctionId, ZCASH_NETWORK.id);
  const noir = new Noir(compiled);
  await phase("Initializing open_bid circuit", args.onProgress, async () => {
    if (typeof noir.init === "function") await noir.init();
  });

  const { witness, returnValue } = await phase("Generating reveal witness", args.onProgress, async () =>
    noir.execute({
      bidder_secret: toCircuitField(args.bidderSecret ?? getBidderSecret()),
      blinding: toCircuitField(args.blinding ?? getBidBlinding(args.auctionId)),
      bid: args.bid,
      currency: toCircuitField(currency),
      expected_commitment: toCircuitField(args.commitment),
    }),
  );

  const bidderBinding = normalizeField(String(Array.isArray(returnValue) ? returnValue[0] : returnValue)).padStart(64, "0");

  const backend = new UltraHonkBackend(compiled.bytecode, { threads: 1 });
  try {
    const proofData = await phase("Generating reveal proof", args.onProgress, async () => backend.generateProof(witness, { keccak: true }));
    const ok = await phase("Locally verifying reveal proof", args.onProgress, async () => backend.verifyProof(proofData, { keccak: true }));
    if (!ok) throw new Error("Reveal proof failed local verification.");

    return await phase("Encoding reveal", args.onProgress, async () => {
      const proofBytesHex = bytesToHex(proofData.proof);
      const publicInputsCommitment = await sha256Hex(`public-inputs|${proofData.publicInputs.join("|")}`);
      const proofCommitment = await sha256Hex(`ultrahonk|open|${proofBytesHex}|${publicInputsCommitment}`);
      return {
        bidderBinding,
        proofBytesHex,
        publicInputs: proofData.publicInputs,
        proofSizeBytes: proofData.proof.length,
        proofCommitment,
      };
    });
  } finally {
    await backend.destroy();
  }
}

/** Verify a sealed-bid proof bundle the way the auctioneer would. */
export async function verifySealedBidProof(bundle: {
  proofHex: string;
  publicInputs: string[];
}, onProgress?: ProofProgress): Promise<boolean> {
  assertBrowserSupport();
  const compiled = sealedBidCircuit as CompiledCircuit;
  assertArtifact(compiled, "sealed_bid");
  const { UltraHonkBackend } = await phase("Loading Barretenberg", onProgress, () => loadBarretenberg());
  const backend = new UltraHonkBackend(compiled.bytecode, { threads: 1 });
  try {
    return await phase("Verifying sealed bid proof", onProgress, async () =>
      backend.verifyProof({ proof: hexToBytesLocal(bundle.proofHex), publicInputs: bundle.publicInputs }, { keccak: true }),
    );
  } finally {
    await backend.destroy();
  }
}

/** Verify a reveal proof the way the auctioneer would, before trusting the amount. */
export async function verifyOpenBidProof(bundle: {
  proofHex: string;
  publicInputs: string[];
}, onProgress?: ProofProgress): Promise<boolean> {
  assertBrowserSupport();
  const compiled = openBidCircuit as CompiledCircuit;
  assertArtifact(compiled, "open_bid");
  const { UltraHonkBackend } = await phase("Loading Barretenberg", onProgress, () => loadBarretenberg());
  const backend = new UltraHonkBackend(compiled.bytecode, { threads: 1 });
  try {
    return await phase("Verifying reveal proof", onProgress, async () =>
      backend.verifyProof({ proof: hexToBytesLocal(bundle.proofHex), publicInputs: bundle.publicInputs }, { keccak: true }),
    );
  } finally {
    await backend.destroy();
  }
}

/** Local hex decode (avoids importing the heavier proof module here). */
function hexToBytesLocal(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Proof hex must have an even length.");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export { concatFieldBytes, bytesToHex };
