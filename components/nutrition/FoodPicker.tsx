"use client";

import { useEffect, useState } from "react";

export type PickedFoodItem = {
  foodVersionId: string;
  label: string;
  selection: { kind: "household"; portionVersionId: string; quantity: number };
};

type SearchFood = {
  id: string;
  name: string;
  portionOptions?: { id: string; label: string; gramsPerUnit: number }[];
};

/**
 * Verified-catalog search + portion picker, shared by "Bugün" (quick add) and "Planım" (plan slots).
 * Deliberately calculation-free on the client: it only collects `foodVersionId` + the household
 * portion selection the user picked — every gram/kcal number is derived server-side, behind
 * `V1MutationService`, exactly like every other mutation in this app.
 */
export function FoodPicker({ onAdd, addLabel = "Ekle" }: { onAdd: (item: PickedFoodItem) => void; addLabel?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState<SearchFood | null>(null);
  const [portionId, setPortionId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setResults([]); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/foods/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { foods?: SearchFood[] }) => setResults(data.foods ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  function pickFood(food: SearchFood) {
    setSelectedFood(food);
    setPortionId(food.portionOptions?.[0]?.id ?? "");
    setQuantity("1");
  }

  function handleAdd() {
    if (!selectedFood || !portionId) return;
    const parsedQuantity = Number(quantity.replace(",", "."));
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    const portion = selectedFood.portionOptions?.find((p) => p.id === portionId);
    onAdd({
      foodVersionId: selectedFood.id,
      label: `${selectedFood.name} — ${parsedQuantity} × ${portion?.label ?? ""}`,
      selection: { kind: "household", portionVersionId: portionId, quantity: parsedQuantity },
    });
    setSelectedFood(null);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="food-picker">
      <input
        type="text"
        inputMode="search"
        placeholder="Yemek ara (ör. yoğurt, elma)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="food-picker-input"
      />
      {loading && <p className="card-copy">Aranıyor…</p>}
      {!selectedFood && results.length > 0 && (
        <ul className="food-picker-results">
          {results.map((food) => (
            <li key={food.id}>
              <button type="button" className="food-picker-result" onClick={() => pickFood(food)}>
                {food.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!selectedFood && !loading && query.trim() && results.length === 0 && (
        <p className="card-copy">Sonuç bulunamadı.</p>
      )}
      {selectedFood && (
        <div className="food-picker-selection">
          <strong>{selectedFood.name}</strong>
          <div className="food-picker-row">
            <select value={portionId} onChange={(e) => setPortionId(e.target.value)}>
              {(selectedFood.portionOptions ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="food-picker-quantity"
              aria-label="Miktar"
            />
          </div>
          <div className="food-picker-row">
            <button type="button" className="secondary-button" onClick={() => setSelectedFood(null)}>Vazgeç</button>
            <button type="button" className="primary-button" onClick={handleAdd}>{addLabel}</button>
          </div>
        </div>
      )}
    </div>
  );
}
