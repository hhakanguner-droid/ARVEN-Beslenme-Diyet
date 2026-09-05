"use client";

import { useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";
import { FoodPicker, type PickedFoodItem } from "@/components/nutrition/FoodPicker";
import { MEAL_TYPE_OPTIONS, mealTypeLabel } from "@/components/nutrition/meal-types";

type MenuItemFit = "good-fit" | "moderate-fit" | "less-fit";
type RankedMenuItem = { itemName: string; rationale: string; fitsGoal?: MenuItemFit };
type MenuAnalysis = { rankedItems: RankedMenuItem[]; uncertainty: string[] };
type MenuPhotoResponse = { photoAssetId: string; analysis: MenuAnalysis | null; aiAvailable: boolean; error?: string };

const FIT_LABEL: Record<MenuItemFit, string> = { "good-fit": "Hedefine uygun", "moderate-fit": "Orta uyumlu", "less-fit": "Daha az uygun" };

/**
 * Menü fotoğrafını analiz eder ve seçenekleri kullanıcının hedefine göre nitel olarak sıralar —
 * puan veya sayı vermez, yalnızca "daha uygun / daha az uygun" gibi bir sıralama ve gerekçe sunar.
 * Bu sayfa hiçbir şeyi otomatik kaydetmez; kullanıcı beğendiği seçeneği aşağıdaki arama kutusuyla
 * bulup isterse bugüne ekleyebilir.
 */
export default function MenuAnalysisPage() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MenuPhotoResponse | null>(null);
  const [mealType, setMealType] = useState<string>(MEAL_TYPE_OPTIONS[0]?.value ?? "lunch");
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(new Set());
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setResult(null);
    setSavedIndexes(new Set());
    setOpenIndex(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/vision/menu-photo", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as MenuPhotoResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Menü analiz edilemedi");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Menü analiz edilemedi");
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
      <h1 className="page-title">Menü Analizi</h1>
      <p className="page-subtitle">Menü seçenekleri hedef, tercih ve güvenlik kısıtlarıyla sıralanır.</p>

      <section className="card">
        <h2 className="card-title">Menü fotoğrafı yükle</h2>
        <p className="card-copy">Restoran menüsünün bir fotoğrafını çek veya galeriden seç. ARVEN seçenekleri hedefine göre sıralar; kesin besin değeri üretmez.</p>
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
          <p className="card-copy">Yapay zeka bağlantısı henüz ayarlanmadığı için menü analizi yapılamadı.</p>
        </section>
      )}

      {result?.analysis && (
        <>
          <h2 className="section-heading">Sıralanmış seçenekler</h2>
          {result.analysis.uncertainty.length > 0 && (
            <p className="card-copy">{result.analysis.uncertainty.join(" ")}</p>
          )}
          {result.analysis.rankedItems.map((item, index) => (
            <section key={index} className="card">
              <strong>{item.itemName}</strong>
              {item.fitsGoal && <p className="card-copy">{FIT_LABEL[item.fitsGoal]}</p>}
              <p className="card-copy">{item.rationale}</p>
              {savedIndexes.has(index) ? (
                <p className="status-banner">Bugüne eklendi.</p>
              ) : openIndex === index ? (
                <FoodPicker
                  initialQuery={item.itemName}
                  addLabel="Bugüne ekle"
                  onAdd={(picked) => addMealItem(index, picked)}
                />
              ) : (
                <button type="button" className="secondary-button" onClick={() => setOpenIndex(index)}>Bu seçeneği ara ve ekle</button>
              )}
            </section>
          ))}
        </>
      )}
    </>
  );
}
