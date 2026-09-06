import Link from "next/link";
import { BrandWordmark } from "@/components/layout/AppShell";

const menu = [
  ["Hedeflerim", "/hedeflerim"],
  ["Sağlık profilim", "/saglik/profil"],
  ["Beslenme stratejim", "/stratejim"],
  ["Tahlillerim", "/saglik/tahliller"],
  ["Takviyeler", "/saglik/takviyeler"],
  ["ARVEN hafızası", "/arven/hafiza"],
  ["Öğün fotoğrafı analizi", "/analiz/ogun"],
  ["Menü analizi", "/analiz/menu"],
  ["Başarılarım", "/basarilarim"],
  ["Bildirimler", "/ayarlar/bildirimler"],
  ["Tariflerim", "/tarifler"],
  ["Kilerim", "/kiler"],
  ["Alışveriş listem", "/alisveris"],
  ["Hafta hazırlığı", "/ayarlar/hafta-hazirlik"],
  ["Veri ve gizlilik", "/ayarlar/veri-ve-gizlilik"],
] as const;

export default function DahaFazlaPage() {
  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Daha Fazla</h1>
      <p className="page-subtitle">Profil, sağlık, hedefler, ARVEN hafızası ve uygulama tercihleri.</p>
      <div className="menu-list">
        {menu.map(([label, href]) => (
          <Link className="menu-row" key={href} href={href}>
            <span>{label}</span><span aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    </>
  );
}
