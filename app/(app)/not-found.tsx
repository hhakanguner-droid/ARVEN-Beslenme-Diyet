import Link from "next/link";
import { EmptyState } from "@/components/states/EmptyState";

/** Shown for any unmatched `app/(app)/**` route (Faz 9: "offline/error/loading states"). */
export default function AppSegmentNotFound() {
  return (
    <>
      <EmptyState icon="🔎" title="Bu sayfa bulunamadı" description="Aradığın sayfa taşınmış veya hiç var olmamış olabilir." />
      <Link href="/bugun" className="primary-button" style={{ marginTop: 16, width: "100%" }}>
        Bugün'e dön
      </Link>
    </>
  );
}
