import { AuctionRoom } from "@/components/auction-room";

export default async function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuctionRoom auctionId={id} />;
}
