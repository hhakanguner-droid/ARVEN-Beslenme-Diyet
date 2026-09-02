import type { NutritionFacts, NutritionTargets, Portion } from "./types";

const ZERO: NutritionFacts = { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

function finiteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
  return value;
}

export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function scaleNutrition(portion: Portion): NutritionFacts {
  const grams = finiteNonNegative(portion.grams, "grams");
  const ratio = grams / portion.food.basisGrams;
  const n = portion.food.nutrition;
  return {
    energyKcal: round(n.energyKcal * ratio, 0),
    proteinG: round(n.proteinG * ratio),
    carbsG: round(n.carbsG * ratio),
    fatG: round(n.fatG * ratio),
    fiberG: round((n.fiberG ?? 0) * ratio),
  };
}

export function sumNutrition(items: NutritionFacts[]): NutritionFacts {
  const total = items.reduce<NutritionFacts>((acc, item) => ({
    energyKcal: acc.energyKcal + finiteNonNegative(item.energyKcal, "energyKcal"),
    proteinG: acc.proteinG + finiteNonNegative(item.proteinG, "proteinG"),
    carbsG: acc.carbsG + finiteNonNegative(item.carbsG, "carbsG"),
    fatG: acc.fatG + finiteNonNegative(item.fatG, "fatG"),
    fiberG: (acc.fiberG ?? 0) + finiteNonNegative(item.fiberG ?? 0, "fiberG"),
  }), { ...ZERO });

  return {
    energyKcal: round(total.energyKcal, 0),
    proteinG: round(total.proteinG),
    carbsG: round(total.carbsG),
    fatG: round(total.fatG),
    fiberG: round(total.fiberG ?? 0),
  };
}

export function calculatePortions(portions: Portion[]): NutritionFacts {
  return sumNutrition(portions.map(scaleNutrition));
}

export function remainingTargets(targets: NutritionTargets, consumed: NutritionFacts): NutritionTargets {
  const remaining = (target: number, actual: number) => round(Math.max(0, target - actual));
  return {
    energyKcal: round(Math.max(0, targets.energyKcal - consumed.energyKcal), 0),
    proteinG: remaining(targets.proteinG, consumed.proteinG),
    carbsG: remaining(targets.carbsG, consumed.carbsG),
    fatG: remaining(targets.fatG, consumed.fatG),
    fiberG: targets.fiberG == null ? undefined : remaining(targets.fiberG, consumed.fiberG ?? 0),
    waterMl: targets.waterMl,
  };
}

export function adherencePercent(target: number, actual: number): number | null {
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(actual) || actual < 0) return null;
  const ratio = Math.min(actual / target, target / Math.max(actual, Number.EPSILON));
  return Math.max(0, Math.min(100, round(ratio * 100, 0)));
}
