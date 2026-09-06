"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";
import { FoodPicker, type PickedFoodItem } from "@/components/nutrition/FoodPicker";
import { MEAL_TYPE_OPTIONS, mealTypeLabel } from "@/components/nutrition/meal-types";

type PlanSlotItem = { foodVersionId: string; foodName: string; grams: number; portion?: { label: string } | null; nutrition: { energyKcal: number } };
type PlanSlot = { mealType: string; items: PlanSlotItem[] };
type Plan = { id: string; createdAt: string; slots: PlanSlot[] } | null;

type DraftItem = { label: string; foodVersionId: string; selection: PickedFoodItem["selection"] };
type DraftSlot = { mealType: string; items: DraftItem[] };

export default function PlanimPage() {
  const [plan, setPlan] = useState<Plan>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftSlots, setDraftSlots] = useState<DraftSlot[]>([]);
  const [activeMealType, setActiveMealType] = useState<string>(MEAL_TYPE_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);
  const [replacingSlotIndex, setReplacingSlotIndex] = useState<number | null>(null);
  const [replacementItems, setReplacementItems] = useState<DraftItem[]>([]);
  const [loggingSlotIndex, setLoggingSlotIndex] = useState<number | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/plan");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Plan alınamadı");
      const data = (await res.json()) as { plan: Plan };
      setPlan(data.plan);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function startEditing() {
    setDraftSlots(plan?.slots.map((slot) => ({ mealType: slot.mealType, items: [] })) ?? []);
    setEditing(true);
  }

  function addDraftItem(item: PickedFoodItem) {
    setDraftSlots((current) => {
      const existing = current.find((s) => s.mealType === activeMealType);
      const newItem: DraftItem = { label: item.label, foodVersionId: item.foodVersionId, selection: item.selection };
      if (existing) {
        return current.map((s) => (s.mealType === activeMealType ? { ...s, items: [...s.items, newItem] } : s));
      }
      return [...current, { mealType: activeMealType, items: [newItem] }];
    });
  }

  function removeDraftItem(mealType: string, index: number) {
    setDraftSlots((current) => current
      .map((s) => (s.mealType === mealType ? { ...s, items: s.items.filter((_, i) => i !== index) } : s))
      .filter((s) => s.items.length > 0));
  }

  async function savePlan() {
    const slots = draftSlots.filter((s) => s.items.length > 0);
    if (slots.length === 0) {
      setError("Kaydetmeden önce en az bir öğüne yemek ekle.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slots: slots.map((s) => ({ mealType: s.mealType, items: s.items.map((i) => ({ foodVersionId: i.foodVersionId, selection: i.selection })) })) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Plan kaydedilemedi");
      const data = (await res.json()) as { plan: Plan };
      setPlan(data.plan);
      setEditing(false);
      setError(null);
      setStatus("Planın kaydedildi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  async function logMealItems(slotIndex: number, mealType: string, items: { foodVersionId: string; selection: PickedFoodItem["selection"] | { kind: "custom-grams"; grams: number } }[], label: string) {
    setLoggingSlotIndex(slotIndex);
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mealType, items }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Öğün kaydedilemedi");
      setError(null);
      setStatus(`${mealTypeLabel(mealType)} bugüne ${label} olarak kaydedildi.`);
      setReplacingSlotIndex(null);
      setReplacementItems([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Öğün kaydedilemedi");
    } finally {
      setLoggingSlotIndex(null);
    }
  }

  function markEaten(slot: PlanSlot, slotIndex: number) {
    // The plan stores a resolved snapshot (grams, not the original household portion pick), so
    // "yedim" replays it as an exact custom-grams entry — a valid `appendManualMeal` selection —
    // rather than trying to reconstruct the portion the user originally chose.
    return logMealItems(
      slotIndex,
      slot.mealType,
      slot.items.map((item) => ({ foodVersionId: item.foodVersionId, selection: { kind: "custom-grams", grams: item.grams } })),
      "yendi",
    );
  }

  function startReplacing(slotIndex: number) {
    setReplacingSlotIndex(slotIndex);
    setReplacementItems([]);
    setError(null);
  }

  function confirmReplacement(slot: PlanSlot, slotIndex: number) {
    if (replacementItems.length === 0) {
      setError("Önce yerine ne yediğini eklemelisin.");
      return;
    }
    return logMealItems(
      slotIndex,
      slot.mealType,
      replacementItems.map((item) => ({ foodVersionId: item.foodVersionId, selection: item.selection })),
      "farklı bir şeyle güncellendi",
    );
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Planım</h1>
      <p className="page-subtitle">Günlük beslenme planın burada. Her değişiklik yeni bir sürüm olarak kaydedilir; önceki planların kaybolmaz.</p>
      <p className="card-copy">
        <Link href="/planim/haftalik">Haftalık plan</Link> · <Link href="/tarifler">Tariflerim</Link> · <Link href="/kiler">Kilerim</Link> · <Link href="/alisveris">Alışveriş listesi</Link>
      </p>

      {status && <p className="status-banner">{status}</p>}
      {error && <p className="error-banner">{error}</p>}

      {loading && <p className="card-copy">Yükleniyor…</p>}

      {!loading && !editing && (
        <>
          {plan ? (
            <>
              <h2 className="section-heading">Öğünler</h2>
              {plan.slots.map((slot, index) => (
                <div key={index} className="card slot-card">
                  <h3 className="card-title">{mealTypeLabel(slot.mealType)}</h3>
                  <ul className="slot-items">
                    {slot.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item.foodName} — {item.portion?.label ?? `${item.grams} g`} ({Math.round(item.nutrition.energyKcal)} kcal)</li>
                    ))}
                  </ul>
                  {replacingSlotIndex !== index ? (
                    <div className="food-picker-row" style={{ marginTop: 10 }}>
                      <button type="button" className="secondary-button" disabled={loggingSlotIndex === index} onClick={() => markEaten(slot, index)}>
                        {loggingSlotIndex === index ? "Kaydediliyor…" : "Bu öğünü yedim"}
                      </button>
                      <button type="button" className="link-button" onClick={() => startReplacing(index)}>Farklı bir şey yedim</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <p className="card-copy">Bu öğün yerine ne yedin?</p>
                      <FoodPicker
                        addLabel="Ekle"
                        onAdd={(item) => setReplacementItems((current) => [...current, { label: item.label, foodVersionId: item.foodVersionId, selection: item.selection }])}
                      />
                      {replacementItems.length > 0 && (
                        <ul className="draft-slot-list">
                          {replacementItems.map((item, itemIndex) => (
                            <li key={itemIndex}>
                              <span>{item.label}</span>
                              <button type="button" className="link-button" onClick={() => setReplacementItems((current) => current.filter((_, i) => i !== itemIndex))}>Kaldır</button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="food-picker-row" style={{ marginTop: 8 }}>
                        <button type="button" className="secondary-button" onClick={() => { setReplacingSlotIndex(null); setReplacementItems([]); }} disabled={loggingSlotIndex === index}>Vazgeç</button>
                        <button type="button" className="primary-button" onClick={() => confirmReplacement(slot, index)} disabled={loggingSlotIndex === index}>
                          {loggingSlotIndex === index ? "Kaydediliyor…" : "Bunu yedim olarak kaydet"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button type="button" className="link-button" onClick={startEditing}>Planı güncelle</button>
            </>
          ) : (
            <>
              <EmptyState icon="▦" title="Henüz plan oluşturulmadı" description="ARVEN öneri sunabilir; kalori ve makro toplamları yalnızca doğrulanmış besin verilerinden hesaplanır." />
              <button type="button" className="primary-button" style={{ marginTop: 14 }} onClick={startEditing}>Plan oluştur</button>
            </>
          )}
        </>
      )}

      {!loading && editing && (
        <section className="card">
          <h2 className="card-title">Öğün ekle</h2>
          <label className="card-copy" htmlFor="plan-meal-type">Hangi öğün?</label>
          <div className="food-picker-row" style={{ marginTop: 8 }}>
            <select id="plan-meal-type" value={activeMealType} onChange={(e) => setActiveMealType(e.target.value)}>
              {MEAL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <FoodPicker onAdd={addDraftItem} addLabel="Öğüne ekle" />

          {draftSlots.map((slot) => (
            <div key={slot.mealType} style={{ marginTop: 16 }}>
              <strong>{mealTypeLabel(slot.mealType)}</strong>
              <ul className="draft-slot-list">
                {slot.items.map((item, index) => (
                  <li key={index}>
                    <span>{item.label}</span>
                    <button type="button" className="link-button" onClick={() => removeDraftItem(slot.mealType, index)}>Kaldır</button>
                  </li>
                ))}
              </ul>
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
