"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";
import { FoodPicker, type PickedFoodItem } from "@/components/nutrition/FoodPicker";

type Recipe = { id: string; name: string; servings: number; ingredientsJson: string; createdAt: string };
type DraftIngredient = { label: string; foodVersionId: string; selection: PickedFoodItem["selection"] };

/**
 * "Tariflerim" (Faz 7): tekrar kullanılabilir tarifler — malzemeler doğrulanmış besin kataloğuna
 * sabit bir kimlikle (foodVersionId) bağlanır, böylece haftalık plan ve alışveriş listesi her
 * zaman güncel malzeme verisiyle hesaplama yapar. Bu, mevcut "tarif oluşturucu"dan (tek seferlik,
 * dondurulmuş besin oluşturan ayrı bir özellik) farklıdır. Düzenleme desteklenmez — güncellemek
 * için sil ve yeniden oluştur.
 */
export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("2");
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/recipes");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Tarifler alınamadı");
      const data = (await res.json()) as { recipes: Recipe[] };
      setRecipes(data.recipes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tarifler alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function startCreating() {
    setName("");
    setServings("2");
    setIngredients([]);
    setCreating(true);
    setError(null);
  }

  async function saveRecipe() {
    if (!name.trim() || ingredients.length === 0) {
      setError("Bir isim ve en az bir malzeme gerekli.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          servings: Number(servings),
          ingredients: ingredients.map((i) => ({ foodVersionId: i.foodVersionId, selection: i.selection })),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Tarif kaydedilemedi");
      setCreating(false);
      setStatus("Tarif kaydedildi.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tarif kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  async function removeRecipe(id: string) {
    try {
      const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silinemedi");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    }
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">Tariflerim</h1>
      <p className="page-subtitle">Malzemeleri doğrulanmış katalogdan seçilen, haftalık planında ve alışveriş listende kullanabileceğin tarifler.</p>
      <p className="card-copy"><Link href="/planim">← Planım&apos;a dön</Link></p>

      {status && <p className="status-banner">{status}</p>}
      {error && <p className="error-banner">{error}</p>}
      {loading && <p className="card-copy">Yükleniyor…</p>}

      {!loading && !creating && (
        <>
          {recipes.length === 0 ? (
            <EmptyState icon="📖" title="Henüz tarif yok" description="Sık kullandığın yemekleri tarif olarak kaydet, sonra haftalık plana tek tıkla ekle." />
          ) : (
            recipes.map((recipe) => (
              <div key={recipe.id} className="card slot-card">
                <h3 className="card-title">{recipe.name}</h3>
                <p className="card-copy">{recipe.servings} porsiyon · {(JSON.parse(recipe.ingredientsJson) as unknown[]).length} malzeme</p>
                <button type="button" className="link-button" onClick={() => removeRecipe(recipe.id)}>Sil</button>
              </div>
            ))
          )}
          <button type="button" className="primary-button" style={{ marginTop: 14 }} onClick={startCreating}>Yeni tarif</button>
        </>
      )}

      {!loading && creating && (
        <section className="card">
          <h2 className="card-title">Yeni tarif</h2>
          <div className="food-picker-row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tarif adı (ör. Mercimek çorbası)" aria-label="Tarif adı" />
          </div>
          <div className="food-picker-row" style={{ marginTop: 6 }}>
            <label htmlFor="recipe-servings">Kaç porsiyon?</label>
            <input id="recipe-servings" type="number" min={1} max={50} value={servings} onChange={(e) => setServings(e.target.value)} style={{ width: 80 }} />
          </div>

          <h3 className="card-title" style={{ marginTop: 16 }}>Malzeme ekle</h3>
          <FoodPicker addLabel="Malzeme ekle" onAdd={(item) => setIngredients((current) => [...current, { label: item.label, foodVersionId: item.foodVersionId, selection: item.selection }])} />
          {ingredients.length > 0 && (
            <ul className="draft-slot-list">
              {ingredients.map((ingredient, index) => (
                <li key={index}>
                  <span>{ingredient.label}</span>
                  <button type="button" className="link-button" onClick={() => setIngredients((current) => current.filter((_, i) => i !== index))}>Kaldır</button>
                </li>
              ))}
            </ul>
          )}

          <div className="food-picker-row" style={{ marginTop: 16 }}>
            <button type="button" className="secondary-button" onClick={() => setCreating(false)} disabled={saving}>Vazgeç</button>
            <button type="button" className="primary-button" onClick={saveRecipe} disabled={saving}>{saving ? "Kaydediliyor…" : "Tarifi kaydet"}</button>
          </div>
        </section>
      )}
    </>
  );
}
