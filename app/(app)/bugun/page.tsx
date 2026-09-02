import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";

export default function BugunPage() {
  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Bugün nasıl ilerliyoruz?</h1>
      <p className="page-subtitle">
        Günlük planın, tüketim kayıtların ve hedeflerin tek yerde. ARVEN yorumlar; sayısal toplamları hesap motoru üretir.
      </p>

      <section className="card soft" aria-labelledby="daily-summary">
        <h2 id="daily-summary" className="card-title">Bugünkü hızlı analiz</h2>
        <p className="card-copy">Henüz kullanıcıya ait aktif günlük plan yüklenmedi.</p>
        <div className="metric-grid" style={{ marginTop: 14 }}>
          <div className="metric-card"><span className="metric-label">Kalori</span><span className="metric-value">—</span><div className="metric-target">aktif hedef bekleniyor</div></div>
          <div className="metric-card"><span className="metric-label">Protein</span><span className="metric-value">—</span><div className="metric-target">aktif hedef bekleniyor</div></div>
          <div className="metric-card"><span className="metric-label">Su</span><span className="metric-value">—</span><div className="metric-target">günlük kayıt bekleniyor</div></div>
          <div className="metric-card"><span className="metric-label">Plan uyumu</span><span className="metric-value">—</span><div className="metric-target">yeterli veri bekleniyor</div></div>
        </div>
      </section>

      <h2 className="section-heading">ARVEN ile hızlı başla</h2>
      <div className="quick-grid">
        <div className="quick-card"><span className="quick-icon">🥗</span><strong>Öğün önerisi</strong></div>
        <div className="quick-card"><span className="quick-icon">⌕</span><strong>Yemek analizi</strong></div>
        <div className="quick-card"><span className="quick-icon">🍽</span><strong>Restoran seçimi</strong></div>
        <div className="quick-card"><span className="quick-icon">▤</span><strong>Tahlil yorumu</strong></div>
      </div>

      <h2 className="section-heading">Bugünün planı</h2>
      <EmptyState
        icon="◷"
        title="Aktif plan bulunmuyor"
        description="Gerçek veri katmanı bağlandığında planlanan öğünler burada görünecek; örnek veya uydurma besin değerleri gösterilmeyecek."
      />
    </>
  );
}
