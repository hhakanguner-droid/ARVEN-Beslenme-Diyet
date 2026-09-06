"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";

type Preferences = { enabled: boolean; prepDayOfWeek: number; prepLocalTime: string } | null;

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

/**
 * "Hafta hazırlığı ve hatırlatmalar" (Faz 7): yalnızca bir tercih ve haftalık bir tamamlandı
 * kutucuğu — gerçek bir bildirim/anımsatma gönderimi YOKTUR (uygulamada henüz push altyapısı
 * bulunmuyor). Hatırlatma yalnızca uygulama içinde, bu tercihe göre gösterilir.
 */
export default function WeekPrepPage() {
  const [preferences, setPreferences] = useState<Preferences>(null);
  const [enabled, setEnabled] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [time, setTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const weekStart = mondayOf(new Date());
  const [prepCompleted, setPrepCompleted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/week-prep/preferences");
        const data = (await res.json().catch(() => ({}))) as { preferences?: Preferences };
        if (data.preferences) {
          setPreferences(data.preferences);
          setEnabled(data.preferences.enabled);
          setDayOfWeek(data.preferences.prepDayOfWeek);
          setTime(data.preferences.prepLocalTime);
        }
      } catch {
        // No preference set yet — defaults stay as-is.
      }
      try {
        const res = await fetch(`/api/week-prep/status?weekStartLocalDate=${weekStart}`);
        const data = (await res.json().catch(() => ({}))) as { isCompleted?: boolean };
        setPrepCompleted(!!data.isCompleted);
      } catch {
        // Best-effort; defaults to not completed.
      }
    })();
  }, [weekStart]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/week-prep/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, prepDayOfWeek: dayOfWeek, prepLocalTime: time }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Kaydedilemedi");
      const data = (await res.json()) as { preferences: Preferences };
      setPreferences(data.preferences);
      setStatus("Tercih kaydedildi.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  async function togglePrepCompleted() {
    const next = !prepCompleted;
    setPrepCompleted(next);
    try {
      await fetch("/api/week-prep/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekStartLocalDate: weekStart, isCompleted: next }),
      });
    } catch {
      setPrepCompleted(!next);
    }
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Hafta Hazırlığı</h1>
      <p className="page-subtitle">Haftalık hazırlık için basit bir hatırlatma tercihi — gerçek bir bildirim gönderimi yoktur, yalnızca uygulama içinde gösterilir.</p>
      <p className="card-copy"><Link href="/planim/haftalik">Haftalık plan</Link> · <Link href="/alisveris">Alışveriş listesi</Link></p>

      {status && <p className="status-banner">{status}</p>}
      {error && <p className="error-banner">{error}</p>}

      <section className="card">
        <h2 className="card-title">Hatırlatma tercihi</h2>
        <div className="food-picker-row">
          <label htmlFor="prep-enabled">
            <input id="prep-enabled" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Hatırlatmayı göster
          </label>
        </div>
        <div className="food-picker-row" style={{ marginTop: 8 }}>
          <label htmlFor="prep-day">Gün</label>
          <select id="prep-day" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
            {DAY_LABELS.map((label, index) => (
              <option key={label} value={index}>{label}</option>
            ))}
          </select>
          <label htmlFor="prep-time">Saat</label>
          <input id="prep-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="primary-button" disabled={saving} onClick={save}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
        </div>
        {preferences && <p className="card-copy" style={{ marginTop: 8 }}>Şu an: {preferences.enabled ? `${DAY_LABELS[preferences.prepDayOfWeek]} ${preferences.prepLocalTime}` : "kapalı"}.</p>}
      </section>

      <section className="card">
        <h2 className="card-title">Bu haftanın hazırlığı</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={prepCompleted} onChange={togglePrepCompleted} />
          <span>Bu haftanın hazırlığını tamamladım</span>
        </label>
      </section>
    </>
  );
}
