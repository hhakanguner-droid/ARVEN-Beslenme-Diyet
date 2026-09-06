"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";

type ShoppingItem = { id: string; foodVersionId: string | null; label: string; neededGrams: number | null; isChecked: boolean };

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}
function addDays(localDate: string, offset: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

/**
 * "Alışveriş listesi" (Faz 7): seçilen haftanın planına göre (tariflerin güncel malzemeleri dahil)
 * hesaplanır, kilerdeki miktar aynı doğrulanmış besne bağlıysa otomatik düşülür. Yeniden
 * oluşturmak listeyi tamamen değiştirir — işaretlemeler dahil.
 */
export default function ShoppingListPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(week: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/shopping-list?weekStartLocalDate=${week}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Liste alınamadı");
      const data = (await res.json()) as { items: ShoppingItem[] };
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liste alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(weekStart); }, [weekStart]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekStartLocalDate: weekStart }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Liste oluşturulamadı");
      const data = (await res.json()) as { items: ShoppingItem[] };
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liste oluşturulamadı");
    } finally {
      setGenerating(false);
    }
  }

  async function toggleChecked(item: ShoppingItem) {
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, isChecked: !i.isChecked } : i)));
    try {
      const res = await fetch(`/api/shopping-list/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isChecked: !item.isChecked }),
      });
      if (!res.ok) throw new Error("Güncellenemedi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncellenemedi");
      await refresh(weekStart);
    }
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Alışveriş Listesi</h1>
      <p className="page-subtitle">Haftalık plandaki ihtiyaçlar, kilerdeki miktar düşülerek hesaplanır.</p>
      <p className="card-copy"><Link href="/planim/haftalik">← Haftalık plan</Link> · <Link href="/kiler">Kilerim</Link></p>

      <div className="food-picker-row">
        <button type="button" className="secondary-button" onClick={() => setWeekStart((w) => addDays(w, -7))}>‹ Önceki hafta</button>
        <strong>{weekStart} – {addDays(weekStart, 6)}</strong>
        <button type="button" className="secondary-button" onClick={() => setWeekStart((w) => addDays(w, 7))}>Sonraki hafta ›</button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      <div style={{ marginTop: 10 }}>
        <button type="button" className="primary-button" disabled={generating} onClick={generate}>
          {generating ? "Oluşturuluyor…" : items.length > 0 ? "Listeyi yeniden oluştur" : "Listeyi oluştur"}
        </button>
      </div>

      {!loading && items.length === 0 && (
        <EmptyState icon="🛒" title="Liste boş" description="Bu hafta için önce bir haftalık plan oluştur, sonra listeyi oluştur." />
      )}

      {items.length > 0 && (
        <ul className="draft-slot-list" style={{ marginTop: 14 }}>
          {items.map((item) => (
            <li key={item.id}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={item.isChecked} onChange={() => toggleChecked(item)} />
                <span style={{ textDecoration: item.isChecked ? "line-through" : "none" }}>
                  {item.label}{item.neededGrams != null ? ` — ${Math.round(item.neededGrams)} g` : ""}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
