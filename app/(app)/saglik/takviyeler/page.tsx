"use client";

import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";

type Supplement = { id: string; foodVersionId: string | null; name: string; note: string | null; isActive: boolean; createdAt: string };

/**
 * Takviye (vitamin/mineral vb.) kayıtları — bu bir ilaç takip modülü DEĞİLDİR: doz, saat veya
 * hatırlatma alanı yoktur, yalnızca "bunu kullanıyorum" bilgisini tutar. Bilinen bazı takviyeler
 * için ARVEN, yapay zekaya hiç danışmadan, sabit ve genel bir bilgi notu gösterir — bu bir tıbbi
 * tavsiye değildir.
 */
export default function SupplementsPage() {
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
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
      // Reference notes are a nice-to-have; a failed lookup just means no note shows.
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
        body: JSON.stringify({ foodVersionId: null, name, note: note || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Eklenemedi");
      }
      setName("");
      setNote("");
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
      <p className="page-subtitle">Beslenmeyle ilişkili takviyelerin kullanıcı tarafından yönetileceği alan; ilaç takibi değildir ve ARVEN tedavi veya doz talimatı vermez.</p>

      <section className="card">
        <h2 className="card-title">Takviye ekle</h2>
        <div className="food-picker-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Takviye adı (ör. D Vitamini)" aria-label="Takviye adı" />
        </div>
        <div className="food-picker-row" style={{ marginTop: 6 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (isteğe bağlı)" aria-label="Not" />
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
              {supplement.note && <p className="card-copy">{supplement.note}</p>}
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

      {!loading && supplements.length === 0 && (
        <p className="card-copy" style={{ marginTop: 16 }}>Henüz bir takviye kaydı yok.</p>
      )}
    </>
  );
}
