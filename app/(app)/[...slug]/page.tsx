import { notFound } from "next/navigation";
import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";

const canonicalRoutes: Record<string, { title: string; description: string }> = {
  "hedeflerim": { title: "Hedeflerim", description: "Aktif hedefler ve ilerleme ayarları." },
  "saglik/profil": { title: "Sağlık Profilim", description: "Beslenme planlamasında kullanılan, kullanıcı tarafından onaylanmış sağlık bağlamı." },
  "stratejim": { title: "Beslenme Stratejim", description: "Hedefe göre uygulanan planlama yaklaşımı ve değişiklik geçmişi." },
  "saglik/tahliller": { title: "Tahlillerim", description: "Yüklenen sonuçlar çıkarılan ve kullanıcı tarafından doğrulanan değerler olarak ayrı tutulur." },
  "saglik/ilac-takviye": { title: "İlaç & Takviyeler", description: "Kayıt ve hatırlatma alanı; ARVEN ilaç başlatma, bırakma veya doz değiştirme talimatı vermez." },
  "arven/hafiza": { title: "ARVEN Hafızası", description: "ARVEN’in kişiselleştirme için tuttuğu kullanıcıya ait şeffaf ve yönetilebilir bilgiler." },
  "basarilarim": { title: "Başarılarım", description: "Doğrulanmış davranış ve ilerleme kayıtlarından oluşan kilometre taşları." },
  "ayarlar/bildirimler": { title: "Bildirimler", description: "Hatırlatma ve bildirim tercihleri." },
  "analiz/ogun": { title: "Öğün Fotoğraf Analizi", description: "Fotoğraf tahminleri kesin veri değildir; porsiyonlar kullanıcı tarafından düzeltilip onaylandıktan sonra hesaplanır." },
  "analiz/menu": { title: "Menü Analizi", description: "Menü seçenekleri hedef, tercih ve güvenlik kısıtlarıyla sıralanır." },
  "rapor/gun-sonu": { title: "Gün Sonu Değerlendirmesi", description: "Günün deterministik toplamları ve ARVEN yorumu." },
  "profil": { title: "Profilim", description: "Hesap, kişisel bilgiler ve gizlilik tercihleri." },
};

export default async function CanonicalPlaceholderPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const key = slug.join("/");
  const route = canonicalRoutes[key];
  if (!route) notFound();

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">{route.title}</h1>
      <p className="page-subtitle">{route.description}</p>
      <div style={{ marginTop: 22 }}>
        <EmptyState icon="✦" title="Bu modül sıradaki fazlarda bağlanacak" description="Rota şimdiden ürün mimarisinde ayrıldı; sahte üretim verisi yerine gerçek persistence ve servis katmanı beklenecek." />
      </div>
    </>
  );
}
