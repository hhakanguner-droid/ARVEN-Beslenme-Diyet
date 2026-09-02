import { BrandWordmark } from "@/components/layout/AppShell";

export default function ArvenPage() {
  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">ARVEN ile konuş</h1>
      <p className="page-subtitle">Beslenmeni sor, planını değerlendir, alternatif iste. ARVEN önerir; kayıt ve plan değişiklikleri sen onaylamadan uygulanmaz.</p>

      <div className="chat-box">
        <div className="card soft" style={{ marginTop: 0 }}>
          <h2 className="card-title">✦ ARVEN</h2>
          <p className="card-copy">Sohbet motoru bağlandığında yanıtlar kullanıcıya ait en küçük gerekli bağlamla üretilecek. Sağlık konusunda tanı veya tedavi önerisi verilmez.</p>
        </div>
      </div>

      <div className="chat-composer">
        <input aria-label="ARVEN'e mesaj" placeholder="ARVEN’e bir şey sor..." disabled />
        <button className="primary-button" type="button" disabled aria-label="Gönder">↑</button>
      </div>
    </>
  );
}
