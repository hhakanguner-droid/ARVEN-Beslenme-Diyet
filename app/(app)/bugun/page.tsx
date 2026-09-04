"use client";

import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";
import { FoodPicker, type PickedFoodItem } from "@/components/nutrition/FoodPicker";
import { MEAL_TYPE_OPTIONS } from "@/components/nutrition/meal-types";

type DailySnapshot = {
  date: string;
  targets: { energyKcal: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number; waterMl?: number } | null;
  consumed: { energyKcal: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number };
  consumptionCoverage: "logged-foods" | "empty-day";
  waterMl: number;
};

const quickStarts = [
  { icon: "🥗", label: "Öğün önerisi" },
  { icon: "⌕", label: "Yemek analizi" },
  { icon: "🍽", label: "Restoran seçimi" },
  { icon: "▤", label: "Tahlil yorumu" },
] as const;

const WATER_QUICK_AMOUNTS = [200, 250, 500] as const;

function round(value: number): string {
  return Math.round(value).toString();
}

export default function BugunPage() {
  const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mealType, setMealType] = useState<string>(MEAL_TYPE_OPTIONS[0].value);
  const [status, setStatus] = useState<string | null>(null);
  const [waterBusy, setWaterBusy] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/today");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Bugünkü veriler alınamadı");
      setSnapshot(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bugünkü veriler alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function addWater(milliliters: number) {
    setWaterBusy(true);
    try {
      const res = await fetch("/api/water", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ milliliters }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Su eklenemedi");
      setSnapshot(await res.json());
      setError(null);
      setStatus(`${milliliters} ml su eklendi.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Su eklenemedi");
    } finally {
      setWaterBusy(false);
    }
  }

  async function addMealItem(item: PickedFoodItem) {
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mealType, items: [{ foodVersionId: item.foodVersionId, selection: item.selection }] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Yemek eklenemedi");
      setSnapshot(await res.json());
      setError(null);
      setStatus(`Eklendi: ${item.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yemek eklenemedi");
    }
  }

  const targets = snapshot?.targets ?? null;
  const consumed = snapshot?.consumed;

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Bugün nasıl ilerliyoruz?</h1>
      <p className="page-subtitle">
        Günlük planın, tüketim kayıtların ve hedeflerin tek yerde. ARVEN yorumlar; sayısal toplamları hesap motoru üretir.
      </p>

      <section className="card soft" aria-labelledby="daily-summary">
        <h2 id="daily-summary" className="card-title">Bugünkü hızlı analiz</h2>
        {loading && <p className="card-copy">Yükleniyor…</p>}
        {!loading && !targets && (
          <p className="card-copy">Henüz aktif bir hedefin yok, bu yüzden hedef karşılaştırması gösterilemiyor — tükettiklerin yine de kaydediliyor.</p>
        )}
        <div className="metric-grid" style={{ marginTop: 14 }}>
          <div className="metric-card">
            <span className="metric-label">Kalori</span>
            <span className="metric-value">{consumed ? round(consumed.energyKcal) : "—"}</span>
            <div className="metric-target">{targets ? `hedef ${round(targets.energyKcal)} kcal` : "aktif hedef bekleniyor"}</div>
          </div>
          <div className="metric-card">
            <span className="metric-label">Protein</span>
            <span className="metric-value">{consumed ? `${round(consumed.proteinG)} g` : "—"}</span>
            <div className="metric-target">{targets ? `hedef ${round(targets.proteinG)} g` : "aktif hedef bekleniyor"}</div>
          </div>
          <div className="metric-card">
            <span className="metric-label">Su</span>
            <span className="metric-value">{snapshot ? `${round(snapshot.waterMl)} ml` : "—"}</span>
            <div className="metric-target">{targets?.waterMl ? `hedef ${round(targets.waterMl)} ml` : "günlük kayıt bekleniyor"}</div>
          </div>
          <div className="metric-card">
            <span className="metric-label">Lif</span>
            <span className="metric-value">{consumed ? `${round(consumed.fiberG ?? 0)} g` : "—"}</span>
            <div className="metric-target">{targets?.fiberG ? `hedef ${round(targets.fiberG)} g` : "yeterli veri bekleniyor"}</div>
          </div>
        </div>
        <div className="water-quick-row">
          {WATER_QUICK_AMOUNTS.map((amount) => (
            <button key={amount} type="button" disabled={waterBusy} onClick={() => addWater(amount)}>+{amount} ml su</button>
          ))}
        </div>
        {status && <p className="status-banner">{status}</p>}
        {error && <p className="error-banner">{error}</p>}
      </section>

      <h2 className="section-heading">Hızlı ekle</h2>
      <section className="card">
        <label className="card-copy" htmlFor="meal-type-select">Hangi öğüne ekleyelim?</label>
        <div className="food-picker-row" style={{ marginTop: 8 }}>
          <select id="meal-type-select" value={mealType} onChange={(e) => setMealType(e.target.value)}>
            {MEAL_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <FoodPicker onAdd={addMealItem} addLabel="Bugüne ekle" />
      </section>

      <h2 className="section-heading">ARVEN ile hızlı başla</h2>
      <div className="quick-grid">
        {quickStarts.map((item) => (
          <button key={item.label} className="quick-card unavailable" type="button" disabled>
            <span className="quick-icon" aria-hidden="true">{item.icon}</span>
            <strong>{item.label}</strong>
            <span className="coming-soon">Yakında</span>
          </button>
        ))}
      </div>
    </>
  );
}
