"use client";

import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";

type Measurement = {
  id: string; localDate: string; weightKg: number | null; bodyFatPercent: number | null;
  waistCm: number | null; hipCm: number | null; chestCm: number | null; note: string | null;
};
type Milestone = { id: string; milestoneKey: string; achievedAt: string };
type BodyPhoto = { id: string; localDate: string; angle: "front" | "side" | "back" | null };
type ReportExport = { id: string; reportType: "daily" | "weekly"; periodLocalDate: string; createdAt: string };
type WeeklyMetrics = { weekStartLocalDate: string; weekEndLocalDate: string; daysWithLoggedFood: number; averageEnergyKcal: number | null; averageWaterMl: number };
type WeeklySummary = { metrics: WeeklyMetrics; weightChangeKg: number | null };

const MILESTONE_LABELS: Record<string, string> = {
  "first-measurement-logged": "İlk ölçüm kaydedildi",
  "five-measurements-logged": "5 ölçüm tamamlandı",
  "twenty-measurements-logged": "20 ölçüm tamamlandı",
  "weight-change-1kg-observed": "1 kg'lık değişim gözlendi",
  "weight-change-5kg-observed": "5 kg'lık değişim gözlendi",
};

function todayLocalDate(): string { return new Date().toISOString().slice(0, 10); }
function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

/**
 * "Gelişim Merkezi" (Faz 8): ölçüm/vücut kompozisyonu geçmişi, bunlardan deterministik olarak
 * hesaplanan kilometre taşları, ve mevcut günün/haftanın beslenme uyum özetinden üretilen
 * indirilebilir PDF raporlar. Adım/uyku/aktivite entegrasyonları bu sürümde yoktur — bkz.
 * docs/ROADMAP.md ve db/migrations/0009_phase8_progress.sql'in üst yorumu.
 */
export default function GelisimPage() {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [reports, setReports] = useState<ReportExport[]>([]);
  const [photos, setPhotos] = useState<BodyPhoto[]>([]);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [photoAngle, setPhotoAngle] = useState<"" | "front" | "side" | "back">("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [localDate, setLocalDate] = useState(() => todayLocalDate());
  const [weightKg, setWeightKg] = useState("");
  const [bodyFatPercent, setBodyFatPercent] = useState("");
  const [waistCm, setWaistCm] = useState("");
  const [hipCm, setHipCm] = useState("");
  const [chestCm, setChestCm] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<"daily" | "weekly" | null>(null);

  async function refresh() {
    try {
      const weekStart = mondayOf(new Date());
      const [measurementsRes, milestonesRes, reportsRes, weeklyRes, photosRes] = await Promise.all([
        fetch("/api/measurements"),
        fetch("/api/progress/milestones"),
        fetch("/api/progress/report"),
        fetch(`/api/progress/summary?type=weekly&weekStartLocalDate=${weekStart}`),
        fetch("/api/body-photos"),
      ]);
      if (!measurementsRes.ok || !milestonesRes.ok || !reportsRes.ok || !weeklyRes.ok || !photosRes.ok) throw new Error("Gelişim verileri alınamadı");
      const measurementsData = (await measurementsRes.json()) as { measurements: Measurement[] };
      const milestonesData = (await milestonesRes.json()) as { milestones: Milestone[] };
      const reportsData = (await reportsRes.json()) as { reports: ReportExport[] };
      const weeklyData = (await weeklyRes.json()) as { report: WeeklySummary };
      const photosData = (await photosRes.json()) as { photos: BodyPhoto[] };
      setMeasurements(measurementsData.measurements.slice().sort((a, b) => b.localDate.localeCompare(a.localDate)));
      setMilestones(milestonesData.milestones);
      setReports(reportsData.reports);
      setWeekly(weeklyData.report);
      setPhotos(photosData.photos);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gelişim verileri alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function addMeasurement() {
    if (!weightKg.trim() && !bodyFatPercent.trim() && !waistCm.trim() && !hipCm.trim() && !chestCm.trim()) {
      setError("En az bir ölçüm değeri gerekli");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/measurements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          localDate,
          weightKg: weightKg.trim() ? Number(weightKg) : null,
          bodyFatPercent: bodyFatPercent.trim() ? Number(bodyFatPercent) : null,
          waistCm: waistCm.trim() ? Number(waistCm) : null,
          hipCm: hipCm.trim() ? Number(hipCm) : null,
          chestCm: chestCm.trim() ? Number(chestCm) : null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Ölçüm kaydedilemedi");
      const data = (await res.json()) as { newMilestones: Milestone[] };
      setWeightKg(""); setBodyFatPercent(""); setWaistCm(""); setHipCm(""); setChestCm(""); setNote("");
      setStatus(data.newMilestones.length > 0 ? `Yeni kilometre taşı: ${data.newMilestones.map((m) => MILESTONE_LABELS[m.milestoneKey] ?? m.milestoneKey).join(", ")}` : "Ölçüm kaydedildi");
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ölçüm kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMeasurement(id: string) {
    try {
      const res = await fetch(`/api/measurements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silinemedi");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    }
  }

  async function generateReport(reportType: "daily" | "weekly") {
    setGenerating(reportType);
    try {
      const periodLocalDate = reportType === "daily" ? todayLocalDate() : mondayOf(new Date());
      const res = await fetch("/api/progress/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportType, periodLocalDate }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Rapor oluşturulamadı");
      setStatus("Rapor oluşturuldu, aşağıdan indirebilirsin");
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rapor oluşturulamadı");
    } finally {
      setGenerating(null);
    }
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.set("photo", file);
      form.set("localDate", localDate);
      if (photoAngle) form.set("angle", photoAngle);
      const res = await fetch("/api/body-photos", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Fotoğraf yüklenemedi");
      setStatus("Fotoğraf kaydedildi");
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fotoğraf yüklenemedi");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function deletePhoto(id: string) {
    try {
      const res = await fetch(`/api/body-photos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silinemedi");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    }
  }

  async function deleteReport(id: string) {
    try {
      const res = await fetch(`/api/progress/report/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silinemedi");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    }
  }

  const latest = measurements[0] ?? null;

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Gelişim Merkezi</h1>
      <p className="page-subtitle">Kilo, ölçüm, vücut kompozisyonu ve plan uyumu zaman içinde gerçek kayıtlarından hesaplanır.</p>

      {error && <p className="error-banner">{error}</p>}
      {status && <p className="card-copy">{status}</p>}

      <div className="metric-grid" style={{ marginTop: 18 }}>
        <div className="metric-card"><span className="metric-label">Son kilo</span><span className="metric-value">{latest?.weightKg != null ? `${latest.weightKg} kg` : "—"}</span><div className="metric-target">{latest ? latest.localDate : "ölçüm yok"}</div></div>
        <div className="metric-card"><span className="metric-label">Bu hafta besin kaydı</span><span className="metric-value">{weekly ? `${weekly.metrics.daysWithLoggedFood} / 7` : "—"}</span><div className="metric-target">{weekly ? `${weekly.metrics.weekStartLocalDate} – ${weekly.metrics.weekEndLocalDate}` : "yeterli veri yok"}</div></div>
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <h2 className="card-title">Ölçüm ekle</h2>
        <div className="food-picker-row">
          <input type="date" value={localDate} onChange={(e) => setLocalDate(e.target.value)} aria-label="Tarih" />
        </div>
        <div className="food-picker-row" style={{ marginTop: 6, flexWrap: "wrap" }}>
          <input type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="Kilo (kg)" aria-label="Kilo" style={{ width: 130 }} />
          <input type="number" step="0.1" value={bodyFatPercent} onChange={(e) => setBodyFatPercent(e.target.value)} placeholder="Vücut yağı (%)" aria-label="Vücut yağ oranı" style={{ width: 150 }} />
          <input type="number" step="0.1" value={waistCm} onChange={(e) => setWaistCm(e.target.value)} placeholder="Bel (cm)" aria-label="Bel" style={{ width: 120 }} />
          <input type="number" step="0.1" value={hipCm} onChange={(e) => setHipCm(e.target.value)} placeholder="Kalça (cm)" aria-label="Kalça" style={{ width: 120 }} />
          <input type="number" step="0.1" value={chestCm} onChange={(e) => setChestCm(e.target.value)} placeholder="Göğüs (cm)" aria-label="Göğüs" style={{ width: 120 }} />
        </div>
        <div className="food-picker-row" style={{ marginTop: 6 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (isteğe bağlı)" aria-label="Not" />
        </div>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="primary-button" disabled={saving} onClick={addMeasurement}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
        </div>
      </section>

      <h2 className="section-heading">İlerleme fotoğrafları</h2>
      <div className="food-picker-row">
        <select value={photoAngle} onChange={(e) => setPhotoAngle(e.target.value as typeof photoAngle)} aria-label="Açı">
          <option value="">Açı (isteğe bağlı)</option>
          <option value="front">Ön</option>
          <option value="side">Yan</option>
          <option value="back">Arka</option>
        </select>
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingPhoto} onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadPhoto(file); e.target.value = ""; }} aria-label="Fotoğraf seç" />
      </div>
      {photos.length === 0 ? (
        <p className="card-copy">Henüz ilerleme fotoğrafı yok.</p>
      ) : (
        <div className="metric-grid">
          {photos.map((photo) => (
            <div key={photo.id} className="card slot-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/body-photos/${photo.id}`} alt={`${photo.localDate} ilerleme fotoğrafı`} style={{ width: "100%", borderRadius: 8 }} />
              <p className="card-copy">{photo.localDate}{photo.angle ? ` — ${photo.angle}` : ""}</p>
              <button type="button" className="link-button" onClick={() => deletePhoto(photo.id)}>Sil</button>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-heading">PDF raporlar</h2>
      <div className="food-picker-row">
        <button type="button" className="primary-button" disabled={generating !== null} onClick={() => generateReport("daily")}>{generating === "daily" ? "Oluşturuluyor…" : "Günlük rapor oluştur"}</button>
        <button type="button" className="primary-button" disabled={generating !== null} onClick={() => generateReport("weekly")}>{generating === "weekly" ? "Oluşturuluyor…" : "Haftalık rapor oluştur"}</button>
      </div>
      {reports.length === 0 ? (
        <p className="card-copy">Henüz oluşturulmuş bir rapor yok.</p>
      ) : (
        reports.map((report) => (
          <div key={report.id} className="card slot-card">
            <h3 className="card-title">{report.reportType === "daily" ? "Günlük" : "Haftalık"} rapor — {report.periodLocalDate}</h3>
            <a className="link-button" href={`/api/progress/report/${report.id}`}>İndir</a>
            <button type="button" className="link-button" onClick={() => deleteReport(report.id)}>Sil</button>
          </div>
        ))
      )}

      <h2 className="section-heading">Kilometre taşları</h2>
      {milestones.length === 0 ? (
        <EmptyState icon="🏅" title="Henüz kilometre taşı yok" description="Ölçüm ekledikçe deterministik olarak (sayı ve değişim bazlı) kilometre taşları kazanılır." />
      ) : (
        <div className="metric-grid">
          {milestones.map((milestone) => (
            <div key={milestone.id} className="metric-card"><span className="metric-label">🏅</span><span className="metric-value">{MILESTONE_LABELS[milestone.milestoneKey] ?? milestone.milestoneKey}</span></div>
          ))}
        </div>
      )}

      <h2 className="section-heading">Ölçüm geçmişi</h2>
      {!loading && measurements.length === 0 && (
        <EmptyState icon="↗" title="İlk ölçümünü bekliyoruz" description="Ölçümler geldikçe trendler deterministik olarak hesaplanacak; ARVEN bu sonuçları yalnızca yorumlayacak." />
      )}
      {measurements.map((measurement) => (
        <div key={measurement.id} className="card slot-card">
          <h3 className="card-title">{measurement.localDate}</h3>
          <p className="card-copy">
            {[
              measurement.weightKg != null ? `${measurement.weightKg} kg` : null,
              measurement.bodyFatPercent != null ? `%${measurement.bodyFatPercent} yağ` : null,
              measurement.waistCm != null ? `bel ${measurement.waistCm} cm` : null,
              measurement.hipCm != null ? `kalça ${measurement.hipCm} cm` : null,
              measurement.chestCm != null ? `göğüs ${measurement.chestCm} cm` : null,
            ].filter(Boolean).join(" · ") || "—"}
            {measurement.note ? ` — ${measurement.note}` : ""}
          </p>
          <button type="button" className="link-button" onClick={() => deleteMeasurement(measurement.id)}>Sil</button>
        </div>
      ))}
    </>
  );
}
