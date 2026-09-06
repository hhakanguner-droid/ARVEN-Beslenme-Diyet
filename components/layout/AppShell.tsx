import { BottomNav } from "./BottomNav";

export function BrandWordmark() {
  return (
    <div className="brand-wordmark" aria-label="ARVEN Beslenme Koçu">
      <span>ARVEN ✦</span>
      <small>BESLENME KOÇU</small>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Faz 9 erişilebilirlik: klavye/ekran okuyucu kullanan biri her sayfada önce alt gezinme
          menüsünün tüm bağlantılarını dinlemek zorunda kalmasın diye, sayfa içeriğine doğrudan
          atlama bağlantısı. Yalnızca klavyeyle Tab'a basıldığında görünür olur. */}
      <a href="#ana-icerik" className="skip-link">İçeriğe geç</a>
      <main className="app-frame">
        <div className="page-content" id="ana-icerik">{children}</div>
        <BottomNav />
      </main>
    </>
  );
}
