"use client";

import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";

type KeyStatus = { hasKey: boolean; updatedAt: string | null; maskedHint: string | null };

/**
 * Ayarlar → Yapay Zeka: siteyi kendi başına deploy eden (yayına alan) kullanıcının, komut satırına
 * hiç dokunmadan kendi yapay zeka (OpenAI) API anahtarını buradan girip kaydetmesini sağlar. Anahtar
 * kaydedildikten sonra tam hâliyle bir daha asla ekrana veya tarayıcıya geri gönderilmez — yalnızca
 * "kayıtlı mı" bilgisi ve son 4 hanesi gösterilir.
 */
export default function AiSettingsPage() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refreshStatus() {
    try {
      const res = await fetch("/api/settings/ai");
      const data = (await res.json().catch(() => ({}))) as { status?: KeyStatus };
      if (data.status) setStatus(data.status);
    } catch {
      // Best-effort; the form still works without a known prior status.
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Kaydedilemedi");
      const data = (await res.json()) as { status: KeyStatus };
      setStatus(data.status);
      setApiKey("");
      setNotice("Anahtar kaydedildi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  async function clearKey() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/ai", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Silinemedi");
      const data = (await res.json()) as { status: KeyStatus };
      setStatus(data.status);
      setNotice("Anahtar silindi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Yapay Zeka Anahtarı</h1>
      <p className="page-subtitle">
        Uygulamanın yapay zeka özelliklerini (sohbet, fotoğraftan yemek/etiket okuma, haftalık
        değerlendirme gibi) çalıştırmak için bir OpenAI API anahtarı gerekir. Bu anahtarı komut
        satırından ayarlamak yerine, siteyi yayına aldıktan sonra doğrudan buradan girebilirsiniz.
      </p>

      {notice && <p className="status-banner">{notice}</p>}
      {error && <p className="error-banner">{error}</p>}

      <section className="card">
        <h2 className="card-title">Anahtar durumu</h2>
        {status?.hasKey ? (
          <p className="card-copy">Kayıtlı bir anahtar var: ****{status.maskedHint}</p>
        ) : (
          <p className="card-copy">Henüz bir API anahtarı eklenmedi. Yapay zeka özellikleri, sunucuda ayrı bir anahtar tanımlanmadıysa çalışmayacaktır.</p>
        )}

        <div className="food-picker-row" style={{ marginTop: 10 }}>
          <label htmlFor="ai-api-key">Yeni anahtar</label>
          <input
            id="ai-api-key"
            type="password"
            autoComplete="off"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button type="button" className="primary-button" disabled={saving || apiKey.trim().length < 8} onClick={save}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
          {status?.hasKey && (
            <button type="button" className="secondary-button" disabled={saving} onClick={clearKey}>
              Anahtarı sil
            </button>
          )}
        </div>
        <p className="card-copy" style={{ marginTop: 8 }}>
          Kaydettiğiniz anahtar tam hâliyle bir daha hiçbir ekranda gösterilmez; yalnızca son 4
          hanesi burada görünür.
        </p>
      </section>
    </>
  );
}
