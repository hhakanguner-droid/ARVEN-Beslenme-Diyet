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
    <main className="app-frame">
      <div className="page-content">{children}</div>
      <BottomNav />
    </main>
  );
}
