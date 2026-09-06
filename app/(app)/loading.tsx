/**
 * Route-segment loading state (Faz 9). Next.js shows this automatically while a page's server data
 * is still resolving, instead of a blank frame. `role="status"`/`aria-live="polite"` so a screen
 * reader announces the wait instead of staying silent.
 */
export default function AppSegmentLoading() {
  return (
    <div className="empty-panel" role="status" aria-live="polite">
      <div className="empty-icon" aria-hidden="true">✦</div>
      <h2>Yükleniyor…</h2>
      <p>Bilgilerin hazırlanıyor, bir saniye.</p>
    </div>
  );
}
