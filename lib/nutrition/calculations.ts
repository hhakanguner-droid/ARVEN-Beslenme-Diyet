import {
  NUTRIENT_UNITS,
  assertExtendedNutritionFacts,
  sumExtendedNutrition,
} from "./nutrients";
import { assertVerifiedNutritionSource } from "./sources";
import type { ExtendedNutritionFacts, NutrientCompleteness } from "./nutrients";
import type { NutritionFacts, NutritionTargets, Portion } from "./types";

const ZERO: NutritionFacts = { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

export type ConsumptionCoverage = "logged-foods" | "empty-day";

function finiteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
  return value;
}

function assertNutritionFactsValid(facts: NutritionFacts, field = "nutrition"): void {
  finiteNonNegative(facts.energyKcal, `${field}.energyKcal`);
  finiteNonNegative(facts.proteinG, `${field}.proteinG`);
  finiteNonNegative(facts.carbsG, `${field}.carbsG`);
  finiteNonNegative(facts.fatG, `${field}.fatG`);
  if (facts.fiberG != null) finiteNonNegative(facts.fiberG, `${field}.fiberG`);
  assertExtendedNutritionFacts(facts.extended);
}

export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function scaleExtendedNutritionExact(
  extended: ExtendedNutritionFacts | undefined,
  ratio: number,
): ExtendedNutritionFacts | undefined {
  if (!extended) return undefined;
  assertExtendedNutritionFacts(extended);
  const scaled: ExtendedNutritionFacts = {};

  for (const [rawKey, value] of Object.entries(extended)) {
    if (!value) continue;
    const key = rawKey as keyof ExtendedNutritionFacts;
    scaled[key] = {
      ...value,
      amount: value.amount == null ? null : value.amount * ratio,
      completeness: value.amount == null ? "unknown" : value.completeness,
    };
  }
  return scaled;
}

function roundExtendedNutrition(extended: ExtendedNutritionFacts | undefined): ExtendedNutritionFacts | undefined {
  if (!extended) return undefined;
  const rounded: ExtendedNutritionFacts = {};
  for (const [rawKey, value] of Object.entries(extended)) {
    if (!value) continue;
    const key = rawKey as keyof ExtendedNutritionFacts;
    rounded[key] = {
      ...value,
      amount: value.amount == null ? null : round(value.amount, 3),
    };
  }
  return rounded;
}

function scaleNutritionExact(portion: Portion): NutritionFacts {
  assertVerifiedNutritionSource(portion.food);
  const grams = finiteNonNegative(portion.grams, "grams");
  const n = portion.food.nutrition;
  assertNutritionFactsValid(n, `food:${portion.food.id}`);
  const ratio = grams / portion.food.basisGrams;

  return {
    energyKcal: n.energyKcal * ratio,
    proteinG: n.proteinG * ratio,
    carbsG: n.carbsG * ratio,
    fatG: n.fatG * ratio,
    fiberG: n.fiberG == null ? undefined : n.fiberG * ratio,
    extended: scaleExtendedNutritionExact(n.extended, ratio),
  };
}

export function scaleNutrition(portion: Portion): NutritionFacts {
  const exact = scaleNutritionExact(portion);
  return {
    energyKcal: round(exact.energyKcal, 0),
    proteinG: round(exact.proteinG),
    carbsG: round(exact.carbsG),
    fatG: round(exact.fatG),
    fiberG: exact.fiberG == null ? undefined : round(exact.fiberG),
    extended: roundExtendedNutrition(exact.extended),
  };
}

export function sumNutrition(items: NutritionFacts[]): NutritionFacts {
  for (const [index, item] of items.entries()) assertNutritionFactsValid(item, `items[${index}]`);

  const core = items.reduce(
    (acc, item) => ({
      energyKcal: acc.energyKcal + item.energyKcal,
      proteinG: acc.proteinG + item.proteinG,
      carbsG: acc.carbsG + item.carbsG,
      fatG: acc.fatG + item.fatG,
    }),
    { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const fiberKnown = items.length === 0 || items.every((item) => item.fiberG != null);
  const fiberG = fiberKnown
    ? round(items.reduce((sum, item) => sum + (item.fiberG ?? 0), 0))
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

/** Portion contributions are accumulated at full precision and rounded only once at the final meal total. */
export function calculatePortions(portions: Portion[]): NutritionFacts {
  return sumNutrition(portions.map(scaleNutritionExact));
}

function combineCompleteness(
  target: NutrientCompleteness,
  actual: NutrientCompleteness,
): NutrientCompleteness {
  if (target === "unknown" || actual === "unknown") return "unknown";
  if (target === "complete" && actual === "complete") return "complete";
  return "partial";
}

function remainingExtendedTargets(
  targets: ExtendedNutritionFacts | undefined,
  consumed: ExtendedNutritionFacts | undefined,
  coverage: ConsumptionCoverage,
): ExtendedNutritionFacts | undefined {
  if (!targets) return undefined;
  assertExtendedNutritionFacts(targets);
  assertExtendedNutritionFacts(consumed);
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
    finiteNonNegative(target.amount, `${rawKey} target`);

    if (!actual || actual.amount == null || actual.unit !== unit) {
      if (coverage === "empty-day") {
        result[key] = {
          amount: round(target.amount, 3),
          unit,
          completeness: target.completeness,
        };
      } else {
        result[key] = { amount: null, unit, completeness: "unknown" };
      }
      continue;
    }
    finiteNonNegative(actual.amount, `${rawKey} consumed`);

    const amount = round(Math.max(0, target.amount - actual.amount), 3);
    result[key] = {
      amount,
      unit,
      completeness: combineCompleteness(target.completeness, actual.completeness),
    };
  }

  return result;
}

export function remainingTargets(
  targets: NutritionTargets,
  consumed: NutritionFacts,
  consumedWaterMl = 0,
  coverage: ConsumptionCoverage = "logged-foods",
): NutritionTargets {
  assertNutritionFactsValid(targets, "targets");
  assertNutritionFactsValid(consumed, "consumed");
  finiteNonNegative(consumedWaterMl, "consumedWaterMl");
  if (targets.waterMl != null) finiteNonNegative(targets.waterMl, "targets.waterMl");

  const remaining = (target: number, actual: number) => round(Math.max(0, target - actual));
  const remainingFiber = targets.fiberG == null
    ? undefined
    : consumed.fiberG == null
      ? coverage === "empty-day" ? round(targets.fiberG) : undefined
      : remaining(targets.fiberG, consumed.fiberG);

  return {
    energyKcal: round(Math.max(0, targets.energyKcal - consumed.energyKcal), 0),
    proteinG: remaining(targets.proteinG, consumed.proteinG),
    carbsG: remaining(targets.carbsG, consumed.carbsG),
    fatG: remaining(targets.fatG, consumed.fatG),
    fiberG: remainingFiber,
    extended: remainingExtendedTargets(targets.extended, consumed.extended, coverage),
    waterMl: targets.waterMl == null ? undefined : remaining(targets.waterMl, consumedWaterMl),
  };
}

export function adherencePercent(target: number, actual: number): number | null {
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(actual) || actual < 0) return null;
  const ratio = Math.min(actual / target, target / Math.max(actual, Number.EPSILON));
  return Math.max(0, Math.min(100, round(ratio * 100, 0)));
}

export { ZERO as EMPTY_NUTRITION };
