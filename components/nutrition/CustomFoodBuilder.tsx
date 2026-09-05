"use client";

import { useState } from "react";
import { FoodPicker, type PickedFoodItem } from "@/components/nutrition/FoodPicker";

type CreatedFood = { id: string; name: string };

type ManualDraft = { name: string; energyKcal: string; proteinG: string; carbsG: string; fatG: string; fiberG: string; portionLabel: string; portionGrams: string };
const EMPTY_MANUAL: ManualDraft = { name: "", energyKcal: "", proteinG: "", carbsG: "", fatG: "", fiberG: "", portionLabel: "1 porsiyon", portionGrams: "" };

type RecipeIngredientDraft = { label: string; foodVersionId: string; selection: PickedFoodItem["selection"] };

function toNumber(value: string): number {
  return Number(value.replace(",", "."));
}

/**
 * "Kendi yemeğini oluştur" + "Tarif oluşturucu": two ways to add a private food to the catalog —
 * typing macro values directly, or summing existing verified foods into one reusable recipe.
 * Both go through `V1MutationService` (createCustomFood / createRecipeFood) so the result is a
 * normal `owner_subject`-scoped catalog row, searchable and loggable exactly like any other food.
 */
export function CustomFoodBuilder({ onCreated }: { onCreated?: (food: CreatedFood) => void }) {
  const [mode, setMode] = useState<"manual" | "recipe">("manual");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [manual, setManual] = useState<ManualDraft>(EMPTY_MANUAL);

  const [recipeName, setRecipeName] = useState("");
  const [servings, setServings] = useState("1");
  const [ingredients, setIngredients] = useState<RecipeIngredientDraft[]>([]);

  async function submitManual() {
    setError(null);
    const grams = toNumber(manual.portionGrams);
    if (!manual.name.trim() || !Number.isFinite(grams) || grams <= 0) {
      setError("Yemek adı ve porsiyon gramajı gerekli.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/foods/custom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: manual.name.trim(),
          energyKcal: toNumber(manual.energyKcal) || 0,
          proteinG: toNumber(manual.proteinG) || 0,
          carbsG: toNumber(manual.carbsG) || 0,
          fatG: toNumber(manual.fatG) || 0,
          fiberG: manual.fiberG.trim() ? toNumber(manual.fiberG) : undefined,
          portions: [{ measure: "serving", label: manual.portionLabel.trim() || "1 porsiyon", gramsPerUnit: grams }],
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Yemek kaydedilemedi");
      const data = (await res.json()) as { food: CreatedFood };
      setStatus(`"${data.food.name}" eklendi. Artık arama kutusundan bulabilirsin.`);
      setManual(EMPTY_MANUAL);
      onCreated?.(data.food);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yemek kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function submitRecipe() {
    setError(null);
    const servingsNumber = toNumber(servings);
    if (!recipeName.trim() || ingredients.length === 0 || !Number.isFinite(servingsNumber) || servingsNumber < 1) {
      setError("Tarif adı, en az bir malzeme ve porsiyon sayısı gerekli.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/foods/recipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: recipeName.trim(),
          servings: servingsNumber,
          ingredients: ingredients.map((item) => ({ foodVersionId: item.foodVersionId, selection: item.selection })),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Tarif kaydedilemedi");
      const data = (await res.json()) as { food: CreatedFood };
      setStatus(`"${data.food.name}" tarifi eklendi (${servingsNumber} porsiyon). Artık arama kutusundan bulabilirsin.`);
      setRecipeName("");
      setServings("1");
      setIngredients([]);
      onCreated?.(data.food);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tarif kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>+ Kendi yemeğini / tarifini oluştur</button>
    );
  }

  return (
    <section className="card">
      <h3 className="card-title">Kendi yemeğini oluştur</h3>
      <div className="food-picker-row" style={{ marginBottom: 12 }}>
        <button type="button" className={mode === "manual" ? "primary-button" : "secondary-button"} onClick={() => setMode("manual")}>Besin değerleriyle</button>
        <button type="button" className={mode === "recipe" ? "primary-button" : "secondary-button"} onClick={() => setMode("recipe")}>Tarif oluşturucu</button>
      </div>

      {mode === "manual" && (
        <div className="custom-food-form">
          <input type="text" placeholder="Yemek adı" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
          <div className="food-picker-row">
            <input type="number" inputMode="decimal" placeholder="kcal / 100 g" value={manual.energyKcal} onChange={(e) => setManual({ ...manual, energyKcal: e.target.value })} />
            <input type="number" inputMode="decimal" placeholder="Protein g / 100 g" value={manual.proteinG} onChange={(e) => setManual({ ...manual, proteinG: e.target.value })} />
          </div>
          <div className="food-picker-row">
            <input type="number" inputMode="decimal" placeholder="Karbonhidrat g / 100 g" value={manual.carbsG} onChange={(e) => setManual({ ...manual, carbsG: e.target.value })} />
            <input type="number" inputMode="decimal" placeholder="Yağ g / 100 g" value={manual.fatG} onChange={(e) => setManual({ ...manual, fatG: e.target.value })} />
          </div>
          <div className="food-picker-row">
            <input type="number" inputMode="decimal" placeholder="Lif g / 100 g (opsiyonel)" value={manual.fiberG} onChange={(e) => setManual({ ...manual, fiberG: e.target.value })} />
          </div>
          <p className="card-copy">Bir porsiyonun kaç gram olduğunu gir (ör. "1 dilim" = 40 g):</p>
          <div className="food-picker-row">
            <input type="text" placeholder="Porsiyon adı (ör. 1 dilim)" value={manual.portionLabel} onChange={(e) => setManual({ ...manual, portionLabel: e.target.value })} />
            <input type="number" inputMode="decimal" placeholder="Gram" value={manual.portionGrams} onChange={(e) => setManual({ ...manual, portionGrams: e.target.value })} />
          </div>
          <div className="food-picker-row" style={{ marginTop: 8 }}>
            <button type="button" className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>Kapat</button>
            <button type="button" className="primary-button" onClick={submitManual} disabled={busy}>{busy ? "Kaydediliyor…" : "Yemeği kaydet"}</button>
          </div>
        </div>
      )}

      {mode === "recipe" && (
        <div className="custom-food-form">
          <input type="text" placeholder="Tarif adı" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />
          <div className="food-picker-row">
            <input type="number" inputMode="decimal" min="1" placeholder="Kaç porsiyon çıkıyor?" value={servings} onChange={(e) => setServings(e.target.value)} />
          </div>
          <FoodPicker
            addLabel="Tarife ekle"
            onAdd={(item) => setIngredients((current) => [...current, { label: item.label, foodVersionId: item.foodVersionId, selection: item.selection }])}
          />
          {ingredients.length > 0 && (
            <ul className="draft-slot-list">
              {ingredients.map((item, index) => (
                <li key={index}>
                  <span>{item.label}</span>
                  <button type="button" className="link-button" onClick={() => setIngredients((current) => current.filter((_, i) => i !== index))}>Kaldır</button>
                </li>
              ))}
            </ul>
          )}
          <div className="food-picker-row" style={{ marginTop: 8 }}>
            <button type="button" className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>Kapat</button>
            <button type="button" className="primary-button" onClick={submitRecipe} disabled={busy}>{busy ? "Kaydediliyor…" : "Tarifi kaydet"}</button>
          </div>
        </div>
      )}

      {status && <p className="status-banner">{status}</p>}
      {error && <p className="error-banner">{error}</p>}
    </section>
  );
}
