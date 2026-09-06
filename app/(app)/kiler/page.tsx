"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";

type PantryItem = { id: string; foodVersionId: string | null; label: string; quantityGrams: number | null; quantityNote: string | null; createdAt: string };

/**
 * "Kilerim" (Faz 7): evde ne olduğunun basit bir takibi. Gram miktarı girilen kalemler, alışveriş
 * listesi oluşturulurken otomatik olarak plandaki ihtiyaçtan düşülür (yalnızca aynı doğrulanmış
 * besne bağlıysa); serbest metin not (ör. "yarım paket") otomatik düşülmez, elle takip edilir.
 */
export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [quantityGrams, setQuantityGrams] = useState("");
  const [quantityNote, setQuantityNote] = useState("");
  const [adding, setAdding] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/pantry");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Kiler alınamadı");
      const data = (await res.json()) as { items: PantryItem[] };
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kiler alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function addItem() {
    if (!label.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/pantry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          foodVersionId: null,
          label,
          quantityGrams: quantityGrams.trim() ? Number(quantityGrams) : null,
          quantityNote: quantityNote.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Eklenemedi");
      setLabel("");
      setQuantityGrams("");
      setQuantityNote("");
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eklenemedi");
    } finally {
      setAdding(false);
    }
  }

  async function removeItem(id: string) {
    try {
      const res = await fetch(`/api/pantry/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silinemedi");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    }
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Kilerim</h1>
      <p className="page-subtitle">Evde olanların basit bir listesi — ilaç veya son kullanma tarihi takibi değildir.</p>
      <p className="card-copy"><Link href="/planim">← Planım&apos;a dön</Link></p>

      {error && <p className="error-banner">{error}</p>}

      <section className="card">
        <h2 className="card-title">Kalem ekle</h2>
        <div className="food-picker-row">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ne var? (ör. Un)" aria-label="Kalem adı" />
        </div>
        <div className="food-picker-row" style={{ marginTop: 6 }}>
          <input type="number" min={0} value={quantityGrams} onChange={(e) => setQuantityGrams(e.target.value)} placeholder="Gram (isteğe bağlı)" aria-label="Gram" style={{ width: 140 }} />
          <input value={quantityNote} onChange={(e) => setQuantityNote(e.target.value)} placeholder="Not (ör. yarım paket)" aria-label="Not" />
        </div>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="primary-button" disabled={adding || !label.trim()} onClick={addItem}>{adding ? "Ekleniyor…" : "Ekle"}</button>
        </div>
      </section>

      {!loading && items.length === 0 && (
        <EmptyState icon="🧺" title="Kiler boş" description="Evde olan malzemeleri ekle; alışveriş listesi oluşturulurken plandaki ihtiyaçtan otomatik düşülür." />
      )}

      {items.map((item) => (
        <div key={item.id} className="card slot-card">
          <h3 className="card-title">{item.label}</h3>
          <p className="card-copy">{item.quantityGrams != null ? `${item.quantityGrams} g` : item.quantityNote ?? "Miktar belirtilmedi"}</p>
          <button type="button" className="link-button" onClick={() => removeItem(item.id)}>Sil</button>
        </div>
      ))}
    </>
  );
}
