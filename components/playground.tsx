"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Eye, Fingerprint, LoaderCircle, Lock, LockKeyhole, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { proveOpenBid, proveSealedBid, type SealedBidProof } from "@/lib/proof/auction-proofs";

/** A fixed, self-contained demo auction. No board, no wallet, no network. */
const DEMO = { id: "playground-demo", reserve: 10, bound: 1000 };
const fmt = (n: number) => n.toLocaleString("en-US");
const short = (h: string, n = 10) => `${h.slice(0, n)}…${h.slice(-6)}`;

type RunState<T> =
  | { status: "idle" }
  | { status: "running"; message: string }
  | { status: "ok"; value: T }
  | { status: "refused"; reason: string };

export function Playground() {
  const [bid, setBid] = useState(50);
  const [seal, setSeal] = useState<RunState<SealedBidProof>>({ status: "idle" });
  const [cheatSeal, setCheatSeal] = useState<RunState<true>>({ status: "idle" });
  const [reveal, setReveal] = useState<RunState<{ amount: number }>>({ status: "idle" });
  const [cheatReveal, setCheatReveal] = useState<RunState<true>>({ status: "idle" });

  const sealed = seal.status === "ok" ? seal.value : null;

  // Act 1 — seal an honest bid. The amount stays private; commitments go public.
  const runSeal = async () => {
    setSeal({ status: "running", message: "Starting…" });
    setReveal({ status: "idle" });
    setCheatReveal({ status: "idle" });
    try {
      const value = await proveSealedBid({
        auctionId: DEMO.id,
        bid,
        minReserve: DEMO.reserve,
        maxBound: DEMO.bound,
        onProgress: (message) => setSeal({ status: "running", message }),
      });
      setSeal({ status: "ok", value });
    } catch (e) {
      setSeal({ status: "refused", reason: e instanceof Error ? e.message : String(e) });
    }
  };

  // Act 2 — try to seal a bid below the reserve. The circuit must refuse.
  const runCheatSeal = async () => {
    setCheatSeal({ status: "running", message: "Asking the circuit to prove a bid of 3 against a reserve of 10…" });
    try {
      await proveSealedBid({
        auctionId: DEMO.id,
        bid: 3,
        minReserve: DEMO.reserve,
        maxBound: DEMO.bound,
        allowOutOfRange: true, // bypass the friendly JS guard; let the circuit judge
        onProgress: (message) => setCheatSeal({ status: "running", message }),
      });
      // Reaching here would mean the circuit proved an inadmissible bid — it won't.
      setCheatSeal({ status: "ok", value: true });
    } catch {
      setCheatSeal({ status: "refused", reason: "assert(bid >= reserve) is unsatisfiable, so no witness and no proof exist." });
    }
  };

  // Act 3a — reveal the real bid. It opens the commitment.
  const runReveal = async () => {
    if (!sealed) return;
    setReveal({ status: "running", message: "Starting…" });
    try {
      await proveOpenBid({
        auctionId: DEMO.id,
        bid,
        commitment: sealed.commitment,
        onProgress: (message) => setReveal({ status: "running", message }),
      });
      setReveal({ status: "ok", value: { amount: bid } });
    } catch (e) {
      setReveal({ status: "refused", reason: e instanceof Error ? e.message : String(e) });
    }
  };

  // Act 3b — try to reveal a different number than was sealed. The circuit must refuse.
  const runCheatReveal = async () => {
    if (!sealed) return;
    const lie = bid + 25;
    setCheatReveal({ status: "running", message: `Claiming the sealed bid was ${fmt(lie)}…` });
    try {
      await proveOpenBid({
        auctionId: DEMO.id,
        bid: lie,
        commitment: sealed.commitment,
        onProgress: (message) => setCheatReveal({ status: "running", message }),
      });
      setCheatReveal({ status: "ok", value: true });
    } catch {
      setCheatReveal({ status: "refused", reason: "pedersen(lie, blinding) ≠ the sealed commitment, so the opening proof is unsatisfiable." });
    }
  };

  return (
    <div className="pg">
      <section className="pg-act">
        <div className="pg-act-head">
          <span className="pg-step">Act 1</span>
          <h2>Seal a bid</h2>
          <p>
            Reserve is {DEMO.reserve} ZEC, ceiling {fmt(DEMO.bound)}. Choose any bid and seal it. A real UltraHonk proof
            is generated and verified right here in your browser — the number never leaves this column.
          </p>
        </div>

        <div className="pg-bid">
          <div className="pg-bid-value"><strong>{fmt(bid)}</strong> ZEC</div>
          <input
            type="range" min={DEMO.reserve} max={300} step={1} value={bid}
            onChange={(e) => { setBid(Number(e.target.value)); setSeal({ status: "idle" }); setReveal({ status: "idle" }); setCheatReveal({ status: "idle" }); }}
            aria-label="Your bid"
          />
          <button className="pg-primary" onClick={runSeal} disabled={seal.status === "running"}>
            {seal.status === "running" ? <><LoaderCircle className="spin" size={16} /> Proving…</> : <><LockKeyhole size={16} /> Seal my bid</>}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {seal.status === "running" && (
            <motion.div key="s-run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pg-proving">
              <div className="proof-rings"><span /><span /><Fingerprint size={30} /></div>
              <p>{seal.message}</p>
            </motion.div>
          )}

          {sealed && (
            <motion.div key="s-ok" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pg-split">
              <div className="pg-col private">
                <span className="pg-col-tag"><Lock size={13} /> What only you know</span>
                <div className="pg-secret"><small>Your bid</small><strong>{fmt(bid)} ZEC</strong></div>
                <p className="pg-col-note">Lives in this browser. It is in no request, no memo, and not among the proof&apos;s public inputs.</p>
              </div>
              <div className="pg-col public">
                <span className="pg-col-tag"><Eye size={13} /> What the whole world sees</span>
                <dl>
                  <div><dt>Commitment</dt><dd><code>{short(sealed.commitment)}</code></dd></div>
                  <div><dt>Nullifier</dt><dd><code>{short(sealed.nullifier)}</code></dd></div>
                  <div><dt>Proof</dt><dd>{fmt(sealed.proofSizeBytes)} bytes</dd></div>
                  <div><dt>Range proven</dt><dd>{DEMO.reserve} ≤ bid ≤ {fmt(DEMO.bound)}</dd></div>
                </dl>
                <p className="pg-ok"><ShieldCheck size={14} /> Verified in your browser. No amount here.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="pg-act">
        <div className="pg-act-head">
          <span className="pg-step attack">Act 2</span>
          <h2>Now try to cheat the seal</h2>
          <p>Ask the circuit to prove a bid of <b>3</b> — below the reserve of {DEMO.reserve}. A dishonest bid has no honest proof, so none can be produced.</p>
        </div>
        <button className="pg-attack" onClick={runCheatSeal} disabled={cheatSeal.status === "running"}>
          {cheatSeal.status === "running" ? <><LoaderCircle className="spin" size={16} /> Trying…</> : <><ShieldAlert size={16} /> Seal a bid below the reserve</>}
        </button>
        <CheatResult state={cheatSeal} refusedTitle="The circuit refused." okTitle="Unexpected: a sub-reserve bid proved (this should never happen)." />
      </section>

      <section className="pg-act">
        <div className="pg-act-head">
          <span className="pg-step">Act 3</span>
          <h2>Reveal — honestly, then dishonestly</h2>
          <p>
            {sealed ? "Open your sealed bid. The honest amount opens it; a different number cannot."
              : "Seal a bid in Act 1 first, then come back to open it."}
          </p>
        </div>
        <div className="pg-reveal-row">
          <button className="pg-primary" onClick={runReveal} disabled={!sealed || reveal.status === "running"}>
            {reveal.status === "running" ? <><LoaderCircle className="spin" size={16} /> Proving…</> : <><Eye size={16} /> Reveal my real bid ({fmt(bid)})</>}
          </button>
          <button className="pg-attack" onClick={runCheatReveal} disabled={!sealed || cheatReveal.status === "running"}>
            {cheatReveal.status === "running" ? <><LoaderCircle className="spin" size={16} /> Trying…</> : <><ShieldAlert size={16} /> Reveal a different number ({fmt(bid + 25)})</>}
          </button>
        </div>
        {reveal.status === "ok" && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pg-reveal-ok">
            <Check size={15} /> Opened. The proof confirms {fmt(reveal.value.amount)} ZEC is exactly what you sealed.
          </motion.p>
        )}
        <CheatResult state={cheatReveal} refusedTitle="The circuit refused the lie." okTitle="Unexpected: a false reveal proved (this should never happen)." />
      </section>
    </div>
  );
}

function CheatResult({ state, refusedTitle, okTitle }: { state: RunState<true>; refusedTitle: string; okTitle: string }) {
  return (
    <AnimatePresence mode="wait">
      {state.status === "running" && (
        <motion.p key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pg-cheat-run">
          <LoaderCircle className="spin" size={14} /> {state.message}
        </motion.p>
      )}
      {state.status === "refused" && (
        <motion.div key="ref" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="pg-refused">
          <strong><ShieldCheck size={15} /> {refusedTitle}</strong>
          <p>{state.reason}</p>
          <span>This is zero-knowledge soundness: the proof is not a check you can skip, it is the only thing that convinces anyone — and it cannot be built for a false statement.</span>
        </motion.div>
      )}
      {state.status === "ok" && (
        <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pg-wrong">
          <strong><X size={15} /> {okTitle}</strong>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
