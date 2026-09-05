"use client";

import { useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";
import { FoodPicker, type PickedFoodItem } from "@/components/nutrition/FoodPicker";
import { MEAL_TYPE_OPTIONS, mealTypeLabel } from "@/components/nutrition/meal-types";

type PortionHint = { measure: string; quantity: number; size?: string; naturalLabel: string };
type PhotoConfidence = "high" | "medium" | "low";
type EstimatedItem = { foodQuery: string; portionHint: PortionHint; confidence: PhotoConfidence };
type MealPhotoEstimate = { items: EstimatedItem[]; overallConfidence: PhotoConfidence; uncertainty: string[] };
type MealPhotoResponse = { photoAssetId: string; estimate: MealPhotoEstimate | null; aiAvailable: boolean; error?: string };

const CONFIDENCE_LABEL: Record<PhotoConfidence, string> = { high: "Yüksek güven", medium: "Orta güven", low: "Düşük güven" };

/**
 * Fotoğraftan yemek tahmini bulunmayı sağlar. ARVEN yalnızca "bunlar olabilir" der — kesin
 * gram/kalori sayıları asla üretmez; kullanıcı her tahmini aşağıdaki arama kutusuyla mevcut,
 * doğrulanmış yemek kataloğundan bulup onaylayarak bugüne ekler. Bu ekleme, uygulamanın zaten
 * var olan "Bugün" akışıyla aynıdır, dolayısıyla düzeltme sonrası hesaplama da otomatik olarak
 * deterministik kalır.
 */
export default function MealPhotoAnalysisPage() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MealPhotoResponse | null>(null);
  const [mealType, setMealType] = useState<string>(MEAL_TYPE_OPTIONS[0]?.value ?? "breakfast");
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(new Set());

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setResult(null);
    setSavedIndexes(new Set());
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/vision/meal-photo", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as MealPhotoResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Fotoğraf analiz edilemedi");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fotoğraf analiz edilemedi");
    } finally {
      setUploading(false);
    }
  }

  async function addMealItem(index: number, item: PickedFoodItem) {
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mealType, items: [{ foodVersionId: item.foodVersionId, selection: item.selection }] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Öğüne eklenemedi");
      }
      setSavedIndexes((prev) => new Set(prev).add(index));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Öğüne eklenemedi");
    }
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Öğün Fotoğraf Analizi</h1>
      <p className="page-subtitle">
        Fotoğraf tahminleri kesin veri değildir; porsiyonlar kullanıcı tarafından düzeltilip onaylandıktan sonra hesaplanır.
      </p>

      <section className="card">
        <h2 className="card-title">Fotoğraf yükle</h2>
        <p className="card-copy">Tabağının bir fotoğrafını çek veya galeriden seç. ARVEN gördüğü besinleri tahmin eder; sen bunları aşağıda arayıp onaylarsın.</p>
        <div className="food-picker-row" style={{ marginTop: 10 }}>
          <label className="secondary-button" style={{ cursor: "pointer" }}>
            {uploading ? "Yükleniyor…" : "Fotoğraf Seç"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ""; }}
            />
          </label>
          <select value={mealType} onChange={(e) => setMealType(e.target.value)} aria-label="Öğün türü">
            {MEAL_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{mealTypeLabel(option.value)}</option>
            ))}
          </select>
        </div>
        {error && <p className="error-banner" style={{ marginTop: 10 }}>{error}</p>}
      </section>

      {result && !result.aiAvailable && (
        <section className="card soft">
          <p className="card-copy">Fotoğrafın kaydedildi, ancak yapay zeka bağlantısı henüz ayarlanmadığı için otomatik tahmin yapılamadı. Yemeği elle arayip ekleyebilirsin.</p>
        </section>
      )}

      {result?.estimate && (
        <>
          <h2 className="section-heading">Tahmin edilen besinler ({CONFIDENCE_LABEL[result.estimate.overallConfidence]})</h2>
          {result.estimate.uncertainty.length > 0 && (
            <p className="card-copy">{result.estimate.uncertainty.join(" ")}</p>
          )}
          {result.estimate.items.map((item, index) => (
            <section key={index} className="card">
              <strong>{item.foodQuery}</strong>
              <p className="card-copy">{item.portionHint.naturalLabel} · {CONFIDENCE_LABEL[item.confidence]}</p>
              {savedIndexes.has(index) ? (
                <p className="status-banner">Bugüne eklendi.</p>
              ) : (
                <FoodPicker
                  initialQuery={item.foodQuery}
                  addLabel="Bugüne ekle"
                  onAdd={(picked) => addMealItem(index, picked)}
                />
              )}
            </section>
          ))}
        </>
      )}
    </>
  );
}
