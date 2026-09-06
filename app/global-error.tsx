"use client";

/**
 * Last-resort error boundary (Faz 9): catches an error thrown so early/high in the tree that even
 * the root layout failed to render, so it must supply its own <html>/<body> — Next.js only mounts
 * this file's markup when that happens. `app/(app)/error.tsx` handles every normal in-app error;
 * this one is only ever seen if that itself somehow fails.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#eef2ee", color: "#173229" }}>
        <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>ARVEN şu anda açılamıyor</h1>
          <p style={{ color: "#64736c", lineHeight: 1.5 }}>Beklenmeyen bir hata oluştu. Lütfen tekrar dene.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ minHeight: 48, padding: "0 20px", borderRadius: 15, border: 0, background: "#075a3c", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            Tekrar dene
          </button>
        </main>
      </body>
    </html>
  );
}
