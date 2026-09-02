import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";

export default function PlanimPage() {
  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Planım</h1>
      <p className="page-subtitle">Günlük ve haftalık beslenme planı burada yönetilecek. Her değişiklik onaydan sonra yeniden hesaplanacak.</p>
      <div className="card soft">
        <h2 className="card-title">Bu hafta</h2>
        <p className="card-copy">Plan verisi oluştuğunda günler, öğünler ve alışverişe dönüşen ihtiyaçlar burada listelenecek.</p>
      </div>
      <h2 className="section-heading">Öğünler</h2>
      <EmptyState icon="▦" title="Henüz plan oluşturulmadı" description="ARVEN öneri sunabilir; kalori ve makro toplamları yalnızca doğrulanmış besin verilerinden hesaplanır." />
    </>
  );
}
