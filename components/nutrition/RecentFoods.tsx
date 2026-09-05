"use client";

import { useEffect, useState } from "react";
import type { PickedFoodItem } from "@/components/nutrition/FoodPicker";

type RecentFood = {
  id: string;
  name: string;
  portionOptions?: { id: string; label: string; gramsPerUnit: number }[];
};

/** "Son yediklerim": one-tap re-add for foods this user has recently meal-logged, using their first known portion. */
export function RecentFoods({ onAdd }: { onAdd: (item: PickedFoodItem) => void }) {
  const [foods, setFoods] = useState<RecentFood[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/foods/recent")
      .then((res) => res.json())
      .then((data: { foods?: RecentFood[] }) => { if (!cancelled) setFoods(data.foods ?? []); })
      .catch(() => { if (!cancelled) setFoods([]); });
    return () => { cancelled = true; };
  }, []);

  if (!foods || foods.length === 0) return null;

  return (
    <div className="recent-foods">
      <p className="card-copy">Son yediklerim</p>
      <div className="recent-foods-row">
        {foods.map((food) => {
          const portion = food.portionOptions?.[0];
          if (!portion) return null;
          return (
            <button
              key={food.id}
              type="button"
              className="recent-food-chip"
              onClick={() => onAdd({
                foodVersionId: food.id,
                label: `${food.name} — 1 × ${portion.label}`,
                selection: { kind: "household", portionVersionId: portion.id, quantity: 1 },
              })}
            >
              {food.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
