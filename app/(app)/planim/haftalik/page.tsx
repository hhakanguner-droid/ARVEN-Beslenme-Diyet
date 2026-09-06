"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";
import { FoodPicker, type PickedFoodItem } from "@/components/nutrition/FoodPicker";
import { MEAL_TYPE_OPTIONS, mealTypeLabel } from "@/components/nutrition/meal-types";

type Recipe = { id: string; name: string; servings: number };

type PlanFoodItem = { kind: "food"; foodVersionId: string; foodName: string; grams: number; nutrition: { energyKcal: number } };
type PlanRecipeItem = { kind: "recipe"; recipeId: string; recipeName: string; servings: number; grams: number; nutrition: { energyKcal: number } };
type PlanSlot = { mealType: string; items: (PlanFoodItem | PlanRecipeItem)[] };
type PlanDay = { localDate: string; slots: PlanSlot[] };
type WeeklyPlan = { id: string; weekStartLocalDate: string; days: PlanDay[] } | null;

type DraftItem =
  | { kind: "food"; label: string; foodVersionId: string; selection: PickedFoodItem["selection"] }
  | { kind: "recipe"; label: string; recipeId: string; servings: number };
type DraftSlot = { mealType: string; items: DraftItem[] };
type DraftDay = { localDate: string; slots: DraftSlot[] };

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sunday..6=Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}
function addDays(localDate: string, offset: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + offset));
  return date.toISOString().slice(0, 10);
}
function emptyDays(weekStart: string): DraftDay[] {
  return Array.from({ length: 7 }, (_, i) => ({ localDate: addDays(weekStart, i), slots: [] }));
}

/**
 * "Haftalık planım" (Faz 7): yedi güne yayılan, tarif referanslarını da destekleyen sürümlü bir
 * plan. Alışveriş listesi bu plandaki tarif referanslarını her seferinde güncel malzeme
 * verisiyle yeniden hesaplar — bkz. /alisveris.
 */
export default function WeeklyPlanPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [plan, setPlan] = useState<WeeklyPlan>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftDays, setDraftDays] = useState<DraftDay[]>(() => emptyDays(weekStart));
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [activeMealType, setActiveMealType] = useState<string>(MEAL_TYPE_OPTIONS[0].value);
  const [recipeId, setRecipeId] = useState("");
  const [recipeServings, setRecipeServings] = useState("1");
  const [saving, setSaving] = useState(false);

  async function refresh(week: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/weekly-plan?weekStartLocalDate=${week}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Plan alınamadı");
      const data = (await res.json()) as { plan: WeeklyPlan };
      setPlan(data.plan);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan alınamadı");
    } finally {
      setLoading(false);
    }
  }

  async function loadRecipes() {
    try {
      const res = await fetch("/api/recipes");
      const data = (await res.json().catch(() => ({}))) as { recipes?: Recipe[] };
      setRecipes(data.recipes ?? []);
    } catch {
      // Recipe list is a nice-to-have for the picker; a failed fetch just leaves it empty.
    }
  }

  useEffect(() => { refresh(weekStart); }, [weekStart]);
  useEffect(() => { loadRecipes(); }, []);

  const weekLabel = useMemo(() => `${weekStart} – ${addDays(weekStart, 6)}`, [weekStart]);

  function startEditing() {
    if (plan) {
      setDraftDays(plan.days.map((day) => ({ localDate: day.localDate, slots: day.slots.map((slot) => ({ mealType: slot.mealType, items: [] })) })));
    } else {
      setDraftDays(emptyDays(weekStart));
    }
    setActiveDayIndex(0);
    setEditing(true);
    setError(null);
  }

  function addDraftFoodItem(item: PickedFoodItem) {
    setDraftDays((current) => current.map((day, index) => {
      if (index !== activeDayIndex) return day;
      const existing = day.slots.find((s) => s.mealType === activeMealType);
      const newItem: DraftItem = { kind: "food", label: item.label, foodVersionId: item.foodVersionId, selection: item.selection };
      if (existing) return { ...day, slots: day.slots.map((s) => (s.mealType === activeMealType ? { ...s, items: [...s.items, newItem] } : s)) };
      return { ...day, slots: [...day.slots, { mealType: activeMealType, items: [newItem] }] };
    }));
  }

  function addDraftRecipeItem() {
    if (!recipeId) return;
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) return;
    const servings = Number(recipeServings) || recipe.servings;
    setDraftDays((current) => current.map((day, index) => {
      if (index !== activeDayIndex) return day;
      const newItem: DraftItem = { kind: "recipe", label: `${recipe.name} (${servings} porsiyon)`, recipeId: recipe.id, servings };
      const existing = day.slots.find((s) => s.mealType === activeMealType);
      if (existing) return { ...day, slots: day.slots.map((s) => (s.mealType === activeMealType ? { ...s, items: [...s.items, newItem] } : s)) };
      return { ...day, slots: [...day.slots, { mealType: activeMealType, items: [newItem] }] };
    }));
  }

  function removeDraftItem(dayIndex: number, mealType: string, itemIndex: number) {
    setDraftDays((current) => current.map((day, index) => {
      if (index !== dayIndex) return day;
      return { ...day, slots: day.slots.map((s) => (s.mealType === mealType ? { ...s, items: s.items.filter((_, i) => i !== itemIndex) } : s)).filter((s) => s.items.length > 0) };
    }));
  }

  async function savePlan() {
    const hasAnyItems = draftDays.some((day) => day.slots.some((slot) => slot.items.length > 0));
    if (!hasAnyItems) {
      setError("Kaydetmeden önce en az bir güne yemek ekle.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/weekly-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekStartLocalDate: weekStart,
          days: draftDays.map((day) => ({
            localDate: day.localDate,
            slots: day.slots.filter((slot) => slot.items.length > 0).map((slot) => ({
              mealType: slot.mealType,
              items: slot.items.map((item) => (item.kind === "food"
                ? { kind: "food" as const, foodVersionId: item.foodVersionId, selection: item.selection }
                : { kind: "recipe" as const, recipeId: item.recipeId, servings: item.servings })),
            })),
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Plan kaydedilemedi");
      const data = (await res.json()) as { plan: WeeklyPlan };
      setPlan(data.plan);
      setEditing(false);
      setStatus("Haftalık planın kaydedildi.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Haftalık Planım</h1>
      <p className="page-subtitle">Bir haftalık öğün planın; tarifler her zaman güncel malzeme verisiyle hesaplanır.</p>
      <p className="card-copy"><Link href="/planim">← Planım&apos;a dön</Link> · <Link href="/tarifler">Tariflerim</Link> · <Link href="/alisveris">Alışveriş listesi</Link></p>

      <div className="food-picker-row">
        <button type="button" className="secondary-button" onClick={() => setWeekStart((w) => addDays(w, -7))}>‹ Önceki hafta</button>
        <strong>{weekLabel}</strong>
        <button type="button" className="secondary-button" onClick={() => setWeekStart((w) => addDays(w, 7))}>Sonraki hafta ›</button>
      </div>

      {status && <p className="status-banner">{status}</p>}
      {error && <p className="error-banner">{error}</p>}
      {loading && <p className="card-copy">Yükleniyor…</p>}

      {!loading && !editing && (
        <>
          {!plan ? (
            <EmptyState icon="🗓" title="Bu hafta için plan yok" description="Yedi günlük bir plan oluştur; her gün için öğün ekleyebilir, tarifleri referans olarak kullanabilirsin." />
          ) : (
            plan.days.map((day, dayIndex) => (
              <div key={day.localDate} className="card slot-card">
                <h3 className="card-title">{DAY_LABELS[dayIndex]} — {day.localDate}</h3>
                {day.slots.length === 0 && <p className="card-copy">Bu gün için öğün yok.</p>}
                {day.slots.map((slot, slotIndex) => (
                  <div key={slotIndex} style={{ marginTop: 8 }}>
                    <strong>{mealTypeLabel(slot.mealType)}</strong>
                    <ul className="slot-items">
                      {slot.items.map((item, itemIndex) => (
                        <li key={itemIndex}>
                          {item.kind === "food" ? item.foodName : `${item.recipeName} (${item.servings} porsiyon)`} — {Math.round(item.nutrition.energyKcal)} kcal
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))
          )}
          <button type="button" className="link-button" onClick={startEditing}>{plan ? "Planı güncelle" : "Plan oluştur"}</button>
        </>
      )}

      {!loading && editing && (
        <section className="card">
          <h2 className="card-title">Öğün ekle</h2>
          <div className="food-picker-row">
            <label htmlFor="wp-day">Gün</label>
            <select id="wp-day" value={activeDayIndex} onChange={(e) => setActiveDayIndex(Number(e.target.value))}>
              {draftDays.map((day, index) => (
                <option key={day.localDate} value={index}>{DAY_LABELS[index]} — {day.localDate}</option>
              ))}
            </select>
            <label htmlFor="wp-meal">Öğün</label>
            <select id="wp-meal" value={activeMealType} onChange={(e) => setActiveMealType(e.target.value)}>
              {MEAL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <h3 className="card-title" style={{ marginTop: 12 }}>Besin ekle</h3>
          <FoodPicker onAdd={addDraftFoodItem} addLabel="Öğüne ekle" />

          <h3 className="card-title" style={{ marginTop: 12 }}>Tarif ekle</h3>
          {recipes.length === 0 ? (
            <p className="card-copy">Henüz tarif yok — <Link href="/tarifler">önce bir tarif oluştur</Link>.</p>
          ) : (
            <div className="food-picker-row">
              <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
                <option value="">Tarif seç…</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>{recipe.name} ({recipe.servings} porsiyon)</option>
                ))}
              </select>
              <input type="number" min={0.25} step={0.25} value={recipeServings} onChange={(e) => setRecipeServings(e.target.value)} style={{ width: 80 }} aria-label="Porsiyon" />
              <button type="button" className="secondary-button" onClick={addDraftRecipeItem} disabled={!recipeId}>Ekle</button>
            </div>
          )}

          {draftDays.map((day, dayIndex) => day.slots.some((s) => s.items.length > 0) && (
            <div key={day.localDate} style={{ marginTop: 16 }}>
              <strong>{DAY_LABELS[dayIndex]}</strong>
              {day.slots.filter((s) => s.items.length > 0).map((slot) => (
                <div key={slot.mealType}>
                  <span className="card-copy">{mealTypeLabel(slot.mealType)}</span>
                  <ul className="draft-slot-list">
                    {slot.items.map((item, itemIndex) => (
                      <li key={itemIndex}>
                        <span>{item.label}</span>
                        <button type="button" className="link-button" onClick={() => removeDraftItem(dayIndex, slot.mealType, itemIndex)}>Kaldır</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}

          <div className="food-picker-row" style={{ marginTop: 16 }}>
            <button type="button" className="secondary-button" onClick={() => setEditing(false)} disabled={saving}>Vazgeç</button>
            <button type="button" className="primary-button" onClick={savePlan} disabled={saving}>{saving ? "Kaydediliyor…" : "Planı kaydet"}</button>
          </div>
        </section>
      )}
    </>
  );
}
