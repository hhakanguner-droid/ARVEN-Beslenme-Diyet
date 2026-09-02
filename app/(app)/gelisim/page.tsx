import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";

export default function GelisimPage() {
  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Gelişim Merkezi</h1>
      <p className="page-subtitle">Kilo, ölçüm, vücut kompozisyonu ve plan uyumu zaman içinde gerçek kayıtlarından hesaplanacak.</p>

      <div className="metric-grid" style={{ marginTop: 18 }}>
        <div className="metric-card"><span className="metric-label">Kilo</span><span className="metric-value">—</span><div className="metric-target">ölçüm yok</div></div>
        <div className="metric-card"><span className="metric-label">Plan uyumu</span><span className="metric-value">—</span><div className="metric-target">yeterli veri yok</div></div>
      </div>

      <h2 className="section-heading">İlerleme grafikleri</h2>
      <EmptyState icon="↗" title="İlk ölçümünü bekliyoruz" description="Ölçümler geldikçe trendler deterministik olarak hesaplanacak; ARVEN bu sonuçları yalnızca yorumlayacak." />
    </>
  );
}
