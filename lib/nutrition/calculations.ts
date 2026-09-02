import { NUTRIENT_UNITS, scaleNutrientValue, sumExtendedNutrition } from "./nutrients";
import { assertVerifiedNutritionSource } from "./sources";
import type { ExtendedNutritionFacts, NutrientValue } from "./nutrients";
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

function scaleExtendedNutrition(extended: ExtendedNutritionFacts | undefined, ratio: number): ExtendedNutritionFacts | undefined {
  if (!extended) return undefined;
  const scaled: ExtendedNutritionFacts = {};
  for (const [key, value] of Object.entries(extended)) {
    if (!value) continue;
    scaled[key as keyof ExtendedNutritionFacts] = scaleNutrientValue(value, ratio);
  }
  return scaled;
}

export function scaleNutrition(portion: Portion): NutritionFacts {
  assertVerifiedNutritionSource(portion.food);
  const grams = finiteNonNegative(portion.grams, "grams");
  const ratio = grams / portion.food.basisGrams;
  const n = portion.food.nutrition;
  return {
    energyKcal: round(n.energyKcal * ratio, 0),
    proteinG: round(n.proteinG * ratio),
    carbsG: round(n.carbsG * ratio),
    fatG: round(n.fatG * ratio),
    fiberG: n.fiberG == null ? undefined : round(n.fiberG * ratio),
    extended: scaleExtendedNutrition(n.extended, ratio),
  };
}

export function sumNutrition(items: NutritionFacts[]): NutritionFacts {
  const core = items.reduce(
    (acc, item) => ({
      energyKcal: acc.energyKcal + finiteNonNegative(item.energyKcal, "energyKcal"),
      proteinG: acc.proteinG + finiteNonNegative(item.proteinG, "proteinG"),
      carbsG: acc.carbsG + finiteNonNegative(item.carbsG, "carbsG"),
      fatG: acc.fatG + finiteNonNegative(item.fatG, "fatG"),
    }),
    { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const fiberKnown = items.length === 0 || items.every((item) => item.fiberG != null);
  const fiberG = fiberKnown
    ? round(items.reduce((sum, item) => sum + finiteNonNegative(item.fiberG ?? 0, "fiberG"), 0))
    : undefined;

  const extendedItems = items.map((item) => item.extended ?? {});
  const extended = extendedItems.some((item) => Object.keys(item).length > 0)
    ? sumExtendedNutrition(extendedItems)
    : undefined;

  return {
    energyKcal: round(core.energyKcal, 0),
    proteinG: round(core.proteinG),
    carbsG: round(core.carbsG),
    fatG: round(core.fatG),
    fiberG,
    extended,
  };
}

export function calculatePortions(portions: Portion[]): NutritionFacts {
  return sumNutrition(portions.map(scaleNutrition));
}

function remainingExtendedTargets(
  targets: ExtendedNutritionFacts | undefined,
  consumed: ExtendedNutritionFacts | undefined,
): ExtendedNutritionFacts | undefined {
  if (!targets) return undefined;
  const result: ExtendedNutritionFacts = {};

  for (const [rawKey, target] of Object.entries(targets)) {
    if (!target) continue;
    const key = rawKey as keyof ExtendedNutritionFacts;
    const unit = NUTRIENT_UNITS[key];
    const actual = consumed?.[key];

    if (target.amount == null || target.unit !== unit) {
      result[key] = { amount: null, unit, completeness: "unknown" };
      continue;
    }

    if (!actual || actual.amount == null || actual.unit !== unit) {
      result[key] = { amount: null, unit, completeness: "unknown" };
      continue;
    }

    const amount = round(Math.max(0, target.amount - actual.amount), 3);
    const completeness: NutrientValue["completeness"] = actual.completeness === "complete" ? "complete" : "partial";
    result[key] = { amount, unit, completeness };
  }

  return result;
}

export function remainingTargets(
  targets: NutritionTargets,
  consumed: NutritionFacts,
  consumedWaterMl = 0,
): NutritionTargets {
  const remaining = (target: number, actual: number) => round(Math.max(0, target - actual));
  finiteNonNegative(consumedWaterMl, "consumedWaterMl");

  return {
    energyKcal: round(Math.max(0, targets.energyKcal - consumed.energyKcal), 0),
    proteinG: remaining(targets.proteinG, consumed.proteinG),
    carbsG: remaining(targets.carbsG, consumed.carbsG),
    fatG: remaining(targets.fatG, consumed.fatG),
    fiberG: targets.fiberG == null || consumed.fiberG == null
      ? undefined
      : remaining(targets.fiberG, consumed.fiberG),
    extended: remainingExtendedTargets(targets.extended, consumed.extended),
    waterMl: targets.waterMl == null ? undefined : remaining(targets.waterMl, consumedWaterMl),
  };
}

export function adherencePercent(target: number, actual: number): number | null {
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(actual) || actual < 0) return null;
  const ratio = Math.min(actual / target, target / Math.max(actual, Number.EPSILON));
  return Math.max(0, Math.min(100, round(ratio * 100, 0)));
}

export { ZERO as EMPTY_NUTRITION };
