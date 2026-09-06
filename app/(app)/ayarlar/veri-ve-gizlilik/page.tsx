"use client";

import { useRef, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";

const DELETE_CONFIRM_PHRASE = "HESABIMI SIL";

type ImportSummary = {
  imported: Record<string, number>;
  skipped: Record<string, number>;
  skipReasons: Record<string, string>;
};

const SECTION_LABELS: Record<string, string> = {
  profile: "Profil", goals: "Hedef", preferences: "Tercihler",
  "meal-log": "Öğün kayıtları", "water-log": "Su kayıtları", measurements: "Ölçümler",
  recipes: "Tarifler", "custom-foods": "Özel yiyecekler", "ai-memory": "ARVEN hafızası", "media-manifest": "Fotoğraf/belgeler",
};

async function downloadFromApi(url: string, filenameFallback: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("İndirme başarısız oldu");
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? filenameFallback;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * "Veri ve gizlilik" (Faz 9): kişisel veri taşınabilirliği (`docs/PORTABILITY.md`) ve hesap silme
 * için tek ekran. Dışa aktarma/içe aktarma her zaman sadece giriş yapmış kullanıcının kendi
 * verisiyle çalışır — sunucu tarafı kimlik doğrulaması `resolveRouteContext` üzerinden zaten
 * zorunlu kılınıyor.
 */
export default function DataAndPrivacyPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleted, setDeleted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDownloadJson() {
    setBusy("json"); setError(null); setMessage(null);
    try {
      await downloadFromApi("/api/export", "arven-yedek.json");
      setMessage("Yedek dosyan indirildi.");
    } catch {
      setError("Yedek indirilemedi. Lütfen tekrar dene.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadCsv(section: "meal-log" | "water-log" | "measurements") {
    setBusy(`csv-${section}`); setError(null); setMessage(null);
    try {
      await downloadFromApi(`/api/export/csv?section=${section}`, `arven-${section}.csv`);
      setMessage("Tablo dosyası indirildi.");
    } catch {
      setError("Dosya indirilemedi. Lütfen tekrar dene.");
    } finally {
      setBusy(null);
    }
  }

  async function handleImportFile(file: File) {
    setBusy("import"); setError(null); setMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const data = (await res.json().catch(() => ({}))) as { summary?: ImportSummary; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Geri yükleme başarısız oldu");
      const importedLines = Object.entries(data.summary?.imported ?? {}).filter(([, n]) => n > 0).map(([key, n]) => `${SECTION_LABELS[key] ?? key}: ${n}`);
      setMessage(importedLines.length ? `Geri yüklendi — ${importedLines.join(", ")}.` : "Dosya okundu ama geri yüklenecek bir şey bulunamadı.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dosya okunamadı. Bunun ARVEN'den indirdiğin bir yedek olduğundan emin ol.");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteAccount() {
    setBusy("delete"); setError(null); setMessage(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: confirmText }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Hesap silinemedi");
      setDeleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hesap silinemedi. Lütfen tekrar dene.");
    } finally {
      setBusy(null);
    }
  }

  if (deleted) {
    return (
      <>
        <BrandWordmark />
        <h1 className="page-title">Hesabın silindi</h1>
        <p className="page-subtitle">Tüm verilerin — kayıtların, fotoğrafların ve raporların — kalıcı olarak silindi. ARVEN'i tekrar kullanmak istersen yeniden başlayabilirsin.</p>
      </>
    );
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Veri ve Gizlilik</h1>
      <p className="page-subtitle">Verilerini indir, yedeğini geri yükle veya hesabını tamamen sil.</p>

      {message && <p role="status" className="card-copy" style={{ color: "var(--arven-green-action)" }}>{message}</p>}
      {error && <p role="alert" className="card-copy" style={{ color: "#c0392b" }}>{error}</p>}

      <h2 className="section-heading">Verilerimi indir</h2>
      <div className="card soft">
        <p className="card-copy">Tüm verilerini tek bir dosyada (JSON) indir — bu dosya daha sonra ARVEN'e geri yüklenebilir, tam bir yedektir.</p>
        <button type="button" className="primary-button" style={{ marginTop: 12, width: "100%" }} disabled={busy !== null} onClick={handleDownloadJson}>
          {busy === "json" ? "Hazırlanıyor…" : "Tam yedeği indir (JSON)"}
        </button>
      </div>

      <div className="card soft" style={{ marginTop: 12 }}>
        <p className="card-copy">Excel/Google E-Tablolar'da açabileceğin basit tablo dosyaları. Bunlar yalnızca okunmak içindir, geri yüklenemez.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => handleDownloadCsv("meal-log")}>
            {busy === "csv-meal-log" ? "Hazırlanıyor…" : "Öğün kayıtları (CSV)"}
          </button>
          <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => handleDownloadCsv("water-log")}>
            {busy === "csv-water-log" ? "Hazırlanıyor…" : "Su kayıtları (CSV)"}
          </button>
          <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => handleDownloadCsv("measurements")}>
            {busy === "csv-measurements" ? "Hazırlanıyor…" : "Ölçümler (CSV)"}
          </button>
        </div>
      </div>

      <h2 className="section-heading">Yedeğimi geri yükle</h2>
      <div className="card soft">
        <p className="card-copy">Daha önce indirdiğin bir JSON yedek dosyasını seç. Geri yüklenen kayıtlar mevcut verilerinin üzerine yazılmaz, yanına eklenir.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          aria-label="Yedek dosyası seç"
          style={{ marginTop: 12 }}
          disabled={busy !== null}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImportFile(file); }}
        />
      </div>

      <div className="danger-zone">
        <h2 className="section-heading" style={{ marginTop: 0, color: "#c0392b" }}>Hesabımı sil</h2>
        <p className="card-copy">Bu işlem geri alınamaz: tüm kayıtların, fotoğrafların ve raporların kalıcı olarak silinir. Devam etmek için aşağıya <strong>{DELETE_CONFIRM_PHRASE}</strong> yaz.</p>
        <input
          type="text"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          aria-label={`Onaylamak için ${DELETE_CONFIRM_PHRASE} yaz`}
          placeholder={DELETE_CONFIRM_PHRASE}
          style={{ width: "100%", minHeight: 46, marginTop: 10, borderRadius: 14, border: "1px solid var(--arven-border)", padding: "0 14px", background: "#fff" }}
        />
        <button
          type="button"
          className="danger-button"
          style={{ marginTop: 12, width: "100%" }}
          disabled={busy !== null || confirmText !== DELETE_CONFIRM_PHRASE}
          onClick={handleDeleteAccount}
        >
          {busy === "delete" ? "Siliniyor…" : "Hesabımı kalıcı olarak sil"}
        </button>
      </div>
    </>
  );
}
