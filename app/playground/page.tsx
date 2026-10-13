import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Playground } from "@/components/playground";

export const metadata = {
  title: "ZecPass | Prove it to yourself",
  description: "Seal a zero-knowledge bid, then try to cheat and watch the circuit refuse. No wallet, no setup.",
};

export default function PlaygroundPage() {
  return (
    <main className="shell pg-shell">
      <Link className="text-button room-back" href="/"><ArrowLeft size={15} /> Board</Link>
      <header className="pg-hero">
        <h1>Prove it to yourself.</h1>
        <p>
          No wallet, no setup. Seal a bid as a zero-knowledge proof, see that the amount never leaves your browser, then
          try to cheat — and watch the math refuse. Every proof here is real UltraHonk, generated and verified on this
          page.
        </p>
      </header>
      <Playground />
    </main>
  );
}
