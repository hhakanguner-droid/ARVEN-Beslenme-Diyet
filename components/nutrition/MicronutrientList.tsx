"use client";

import { COMPLETENESS_LABELS, nutrientLabel } from "@/components/nutrition/nutrient-labels";

export type NutrientValueLike = { amount: number | null; unit: string; completeness: "complete" | "partial" | "unknown" };

/**
 * Displays today's summed vitamin/mineral values alongside their completeness — "tam" means every
 * logged food had verified data for that nutrient, "kısmi" means some did not, and a nutrient the
 * user hasn't logged anything verified for at all simply doesn't appear (nothing to show yet).
 */
export function MicronutrientList({ extended }: { extended?: Record<string, NutrientValueLike> }) {
  const entries = Object.entries(extended ?? {}).filter(([, value]) => value && value.amount != null);
  if (entries.length === 0) {
    return <p className="card-copy">Bugün için henüz vitamin/mineral verisi olan bir yemek eklenmedi.</p>;
  }
  return (
    <ul className="micronutrient-list">
      {entries.map(([key, value]) => (
        <li key={key} className="micronutrient-row">
          <span className="micronutrient-name">{nutrientLabel(key)}</span>
          <span className="micronutrient-amount">{value.amount} {value.unit}</span>
          <span className={`micronutrient-badge micronutrient-badge-${value.completeness}`}>{COMPLETENESS_LABELS[value.completeness] ?? value.completeness}</span>
        </li>
      ))}
    </ul>
  );
}
