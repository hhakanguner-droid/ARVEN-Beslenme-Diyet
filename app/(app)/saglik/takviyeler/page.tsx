"use client";

import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";

type Supplement = { id: string; foodVersionId: string | null; name: string; note: string | null; isActive: boolean; createdAt: string };

/** Takviye kayıtları ilaç/doz/saat/not takibi değildir; yalnız curated bir takviyenin aktif/pasif durumunu tutar. */
export default function SupplementsPage() {
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function loadSupplements() {
    try {
      const res = await fetch("/api/supplements");
      const data = (await res.json().catch(() => ({}))) as { supplements?: Supplement[] };
      const list = data.supplements ?? [];
      setSupplements(list);
      for (const supplement of list) fetchReferenceNote(supplement.name);
    } finally {
      setLoading(false);
    }
  }

  async function fetchReferenceNote(supplementName: string) {
    try {
      const res = await fetch(`/api/supplements/reference?name=${encodeURIComponent(supplementName)}`);
      const data = (await res.json().catch(() => ({}))) as { note?: { note: string } | null };
      if (data.note) setNotes((prev) => ({ ...prev, [supplementName]: data.note!.note }));
    } catch {
      // Reference notes are optional deterministic information.
    }
  }

  useEffect(() => { loadSupplements(); }, []);

  async function addSupplement() {
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/supplements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ foodVersionId: null, name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Eklenemedi");
      }
      setName("");
      await loadSupplements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eklenemedi");
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(supplement: Supplement) {
    try {
      const res = await fetch(`/api/supplements/${supplement.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !supplement.isActive }),
      });
      if (!res.ok) throw new Error("Güncellenemedi");
      await loadSupplements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncellenemedi");
    }
  }

  async function removeSupplement(id: string) {
    try {
      const res = await fetch(`/api/supplements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silinemedi");
      await loadSupplements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    }
  }

  const active = supplements.filter((s) => s.isActive);
  const inactive = supplements.filter((s) => !s.isActive);

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Takviyeler</h1>
      <p className="page-subtitle">Beslenmeyle ilişkili takviyelerin aktif/pasif kaydı; ilaç, doz, saat, program veya serbest metin notu tutulmaz.</p>

      <section className="card">
        <h2 className="card-title">Takviye ekle</h2>
        <div className="food-picker-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Takviye adı (ör. D Vitamini)" aria-label="Takviye adı" />
        </div>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="primary-button" disabled={adding || !name.trim()} onClick={addSupplement}>
            {adding ? "Ekleniyor…" : "Ekle"}
          </button>
        </div>
        {error && <p className="error-banner" style={{ marginTop: 10 }}>{error}</p>}
      </section>

      {!loading && active.length > 0 && (
        <>
          <h2 className="section-heading">Kullanmakta olduğun takviyeler</h2>
          {active.map((supplement) => (
            <section key={supplement.id} className="card">
              <strong>{supplement.name}</strong>
              {notes[supplement.name] && <p className="card-copy">{notes[supplement.name]}</p>}
              <div className="food-picker-row" style={{ marginTop: 10 }}>
                <button type="button" className="secondary-button" onClick={() => toggleActive(supplement)}>Kullanmayı bıraktım</button>
                <button type="button" className="secondary-button" onClick={() => removeSupplement(supplement.id)}>Kaydı sil</button>
              </div>
            </section>
          ))}
        </>
      )}

      {!loading && inactive.length > 0 && (
        <>
          <h2 className="section-heading">Bıraktıkların</h2>
          {inactive.map((supplement) => (
            <section key={supplement.id} className="card soft">
              <strong>{supplement.name}</strong>
              <div className="food-picker-row" style={{ marginTop: 10 }}>
                <button type="button" className="secondary-button" onClick={() => toggleActive(supplement)}>Tekrar kullanmaya başladım</button>
                <button type="button" className="secondary-button" onClick={() => removeSupplement(supplement.id)}>Kaydı sil</button>
              </div>
            </section>
          ))}
        </>
      )}

      {!loading && supplements.length === 0 && <p className="card-copy" style={{ marginTop: 16 }}>Henüz bir takviye kaydı yok.</p>}
    </>
  );
}
