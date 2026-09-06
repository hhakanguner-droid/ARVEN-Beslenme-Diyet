"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/states/EmptyState";

/**
 * Route-segment error boundary (Faz 9: "offline/error/loading states" — `docs/ROADMAP.md`).
 * Catches any render/data error thrown inside `app/(app)/**` so one broken screen never turns into
 * a blank white page; `reset()` re-renders the segment without a full page reload. Deliberately
 * never shows the raw error message to the user (it may contain internal details) — only logs it.
 */
export default function AppSegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("ARVEN sayfa hatası:", error);
  }, [error]);

  return (
    <>
      <EmptyState
        icon="⚠️"
        title="Bir şeyler ters gitti"
        description="Bu sayfa yüklenirken beklenmeyen bir hata oluştu. Tekrar dene, sorun devam ederse birkaç dakika sonra yeniden gel."
      />
      <button type="button" className="primary-button" style={{ marginTop: 16, width: "100%" }} onClick={() => reset()}>
        Tekrar dene
      </button>
    </>
  );
}
