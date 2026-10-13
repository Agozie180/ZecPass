import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateAuctionForm } from "@/components/create-auction-form";

export default function CreatePage() {
  return (
    <main className="shell create-shell">
      <Link className="text-button room-back" href="/"><ArrowLeft size={15} /> Board</Link>
      <header className="band-head">
        <h1>Open an auction</h1>
        <p>A seller sets a public reserve and rule. Bidders then prove their bids clear the reserve without revealing them.</p>
      </header>
      <CreateAuctionForm />
    </main>
  );
}
