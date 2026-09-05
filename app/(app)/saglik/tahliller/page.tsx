"use client";

import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";

type LabEntry = {
  id: string;
  markerName: string;
  valueText: string;
  unitText: string | null;
  referenceRangeText: string | null;
  status: "extracted" | "confirmed";
  createdAt: string;
};
type LabPhotoResponse = { labDocumentId?: string; entries?: LabEntry[]; uncertainty?: string[]; aiAvailable?: boolean; localOnly?: boolean; error?: string };

const emptyDraft = { markerName: "", valueText: "", unitText: "", referenceRangeText: "" };

export default function LabResultsPage() {
  const [entries, setEntries] = useState<LabEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailableNotice, setAiUnavailableNotice] = useState(false);
  const [uncertainty, setUncertainty] = useState<string[]>([]);
  const [allowExternalAi, setAllowExternalAi] = useState(false);
  const [edits, setEdits] = useState<Record<string, typeof emptyDraft>>({});
  const [manualDraft, setManualDraft] = useState(emptyDraft);
  const [addingManual, setAddingManual] = useState(false);

  async function loadEntries() {
    try {
      const res = await fetch("/api/lab/entries");
      const data = (await res.json().catch(() => ({}))) as { entries?: LabEntry[] };
      setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEntries(); }, []);

  function draftFor(entry: LabEntry) {
    return edits[entry.id] ?? { markerName: entry.markerName, valueText: entry.valueText, unitText: entry.unitText ?? "", referenceRangeText: entry.referenceRangeText ?? "" };
  }
  function setDraft(id: string, draft: typeof emptyDraft) {
    setEdits((prev) => ({ ...prev, [id]: draft }));
  }

  async function handleFile(file: File, useExternalAi: boolean) {
    if (useExternalAi && !allowExternalAi) {
      setError("Otomatik tahlil okuması için fotoğrafın harici yapay zekâ sağlayıcısına gönderilmesine açıkça izin vermelisin.");
      return;
    }
    setUploading(true);
    setError(null);
    setUncertainty([]);
    setAiUnavailableNotice(false);
    try {
      const form = new FormData();
      form.append("photo", file);
      const headers: Record<string, string> = useExternalAi
        ? { "x-arven-lab-ai-consent": "1" }
        : { "x-arven-lab-ai-mode": "local" };
      const res = await fetch("/api/vision/lab-photo", { method: "POST", headers, body: form });
      const data = (await res.json().catch(() => ({}))) as LabPhotoResponse;
      if (!res.ok || data.error) throw new Error(data.error ?? "Tahlil fotoğrafı işlenemedi");
      if (!useExternalAi || !data.aiAvailable) setAiUnavailableNotice(true);
      setUncertainty(data.uncertainty ?? []);
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tahlil fotoğrafı işlenemedi");
    } finally {
      setUploading(false);
    }
  }

  async function confirmEntry(entry: LabEntry) {
    const draft = draftFor(entry);
    try {
      const res = await fetch(`/api/lab/entries/${entry.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markerName: draft.markerName, valueText: draft.valueText, unitText: draft.unitText || null, referenceRangeText: draft.referenceRangeText || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Onaylanamadı");
      }
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onaylanamadı");
    }
  }

  async function deleteEntry(id: string) {
    try {
      const res = await fetch(`/api/lab/entries/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Silinemedi");
      }
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    }
  }

  async function addManualEntry() {
    if (!manualDraft.markerName.trim() || !manualDraft.valueText.trim()) return;
    setAddingManual(true);
    try {
      const res = await fetch("/api/lab/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markerName: manualDraft.markerName, valueText: manualDraft.valueText, unitText: manualDraft.unitText || null, referenceRangeText: manualDraft.referenceRangeText || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Eklenemedi");
      }
      setManualDraft(emptyDraft);
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eklenemedi");
    } finally {
      setAddingManual(false);
    }
  }

  const extracted = entries.filter((e) => e.status === "extracted");
  const confirmed = entries.filter((e) => e.status === "confirmed");

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Tahlillerim</h1>
      <p className="page-subtitle">Yüklenen sonuçlar çıkarılan ve kullanıcı tarafından doğrulanan değerler olarak ayrı tutulur.</p>

      <section className="card">
        <h2 className="card-title">Tahlil fotoğrafı yükle</h2>
        <p className="card-copy">Fotoğrafı yalnızca saklayıp değerleri elle girebilir veya açık izin vererek ARVEN'in harici yapay zekâ sağlayıcısıyla yalnızca metin çıkarımı yapmasını isteyebilirsin.</p>
        <label className="card-copy" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
          <input type="checkbox" checked={allowExternalAi} onChange={(e) => setAllowExternalAi(e.target.checked)} />
          <span>Tahlil fotoğrafımın yalnızca metin çıkarımı amacıyla harici yapay zekâ sağlayıcısına gönderilmesine izin veriyorum.</span>
        </label>
        <div className="food-picker-row" style={{ marginTop: 10 }}>
          <label className="secondary-button" style={{ cursor: uploading ? "not-allowed" : "pointer" }}>
            {uploading ? "Yükleniyor…" : "Sadece Kaydet"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file, false); e.target.value = ""; }}
            />
          </label>
          <label className="primary-button" style={{ cursor: allowExternalAi && !uploading ? "pointer" : "not-allowed", opacity: allowExternalAi ? 1 : 0.6 }}>
            {uploading ? "Yükleniyor…" : "AI ile Oku"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              disabled={uploading || !allowExternalAi}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file, true); e.target.value = ""; }}
            />
          </label>
        </div>
        {aiUnavailableNotice && <p className="card-copy" style={{ marginTop: 10 }}>Fotoğrafın kaydedildi. Otomatik okuma yapılmadı; değerleri aşağıdan elle ekleyebilirsin.</p>}
        {uncertainty.length > 0 && (
          <div className="error-banner" style={{ marginTop: 10 }}>
            <strong>Kontrol etmen gereken belirsizlikler:</strong>
            <ul>{uncertainty.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          </div>
        )}
        {error && <p className="error-banner" style={{ marginTop: 10 }}>{error}</p>}
      </section>

      {!loading && extracted.length > 0 && (
        <>
          <h2 className="section-heading">Onay bekleyen okumalar</h2>
          {extracted.map((entry) => {
            const draft = draftFor(entry);
            return (
              <section key={entry.id} className="card soft">
                <div className="food-picker-row">
                  <input value={draft.markerName} onChange={(e) => setDraft(entry.id, { ...draft, markerName: e.target.value })} placeholder="Tahlil adı" aria-label="Tahlil adı" />
                  <input value={draft.valueText} onChange={(e) => setDraft(entry.id, { ...draft, valueText: e.target.value })} placeholder="Değer" aria-label="Değer" />
                </div>
                <div className="food-picker-row" style={{ marginTop: 6 }}>
                  <input value={draft.unitText} onChange={(e) => setDraft(entry.id, { ...draft, unitText: e.target.value })} placeholder="Birim (ör. mg/dL)" aria-label="Birim" />
                  <input value={draft.referenceRangeText} onChange={(e) => setDraft(entry.id, { ...draft, referenceRangeText: e.target.value })} placeholder="Referans aralığı" aria-label="Referans aralığı" />
                </div>
                <div className="food-picker-row" style={{ marginTop: 10 }}>
                  <button type="button" className="primary-button" onClick={() => confirmEntry(entry)}>Onayla</button>
                  <button type="button" className="secondary-button" onClick={() => deleteEntry(entry.id)}>Reddet</button>
                </div>
              </section>
            );
          })}
        </>
      )}

      <h2 className="section-heading">Elle değer ekle</h2>
      <section className="card">
        <div className="food-picker-row">
          <input value={manualDraft.markerName} onChange={(e) => setManualDraft({ ...manualDraft, markerName: e.target.value })} placeholder="Tahlil adı" aria-label="Tahlil adı" />
          <input value={manualDraft.valueText} onChange={(e) => setManualDraft({ ...manualDraft, valueText: e.target.value })} placeholder="Değer" aria-label="Değer" />
        </div>
        <div className="food-picker-row" style={{ marginTop: 6 }}>
          <input value={manualDraft.unitText} onChange={(e) => setManualDraft({ ...manualDraft, unitText: e.target.value })} placeholder="Birim (ör. mg/dL)" aria-label="Birim" />
          <input value={manualDraft.referenceRangeText} onChange={(e) => setManualDraft({ ...manualDraft, referenceRangeText: e.target.value })} placeholder="Referans aralığı" aria-label="Referans aralığı" />
        </div>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="primary-button" disabled={addingManual || !manualDraft.markerName.trim() || !manualDraft.valueText.trim()} onClick={addManualEntry}>
            {addingManual ? "Ekleniyor…" : "Ekle"}
          </button>
        </div>
      </section>

      {!loading && confirmed.length > 0 && (
        <>
          <h2 className="section-heading">Onaylanmış değerler</h2>
          {confirmed.map((entry) => (
            <section key={entry.id} className="card">
              <strong>{entry.markerName}</strong>
              <p className="card-copy">
                {entry.valueText}{entry.unitText ? ` ${entry.unitText}` : ""}
                {entry.referenceRangeText ? ` · Referans: ${entry.referenceRangeText}` : ""}
              </p>
              <button type="button" className="secondary-button" onClick={() => deleteEntry(entry.id)}>Sil</button>
            </section>
          ))}
        </>
      )}

      {!loading && entries.length === 0 && <p className="card-copy" style={{ marginTop: 16 }}>Henüz bir tahlil değeri yok.</p>}
    </>
  );
}
