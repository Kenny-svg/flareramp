import { ProofReceiptView } from "@/components/ProofReceiptView";

export const dynamic = "force-dynamic";

export default function ReceiptPage({
  params,
}: {
  params: { transactionId: string };
}) {
  return <ProofReceiptView transactionId={params.transactionId} />;
}
