import { isCanonicalUtcInstant } from "../time/canonical";
import type { Food, FoodPortionOption, NutritionSource, NutritionSourceProvider } from "./types";

const ALLOWED_PROVIDERS = new Set<NutritionSourceProvider>([
  "open-food-facts",
  "usda",
  "turkomp",
  "bls",
  "swiss-fcd",
  "manual-verified",
]);

function assertSource(source: NutritionSource, subject: string): void {
  if (!source || !ALLOWED_PROVIDERS.has(source.provider)) {
    throw new Error(`${subject} does not have an allowed nutrition source`);
  }

  if (!isCanonicalUtcInstant(source.verifiedAt)) {
    throw new Error(`${subject} has an invalid verifiedAt timestamp`);
  }

  if (source.provider !== "manual-verified" && (!source.externalId || source.externalId.trim().length === 0)) {
    throw new Error(`${subject} is missing its external source id`);
  }
}

export function assertVerifiedNutritionSource(food: Food): void {
  assertSource(food.source, `Food ${food.id}`);
}

/** Validates only the portion option actually selected for a log, not every option a food happens to carry. */
export function assertVerifiedPortionOptionSource(option: FoodPortionOption): void {
  if (!Number.isFinite(option.gramsPerUnit) || option.gramsPerUnit <= 0) {
    throw new Error(`Portion option ${option.id} has an invalid gramsPerUnit`);
  }
  assertSource(option.source, `Portion option ${option.id}`);
}

export function assertFoodsVerified(foods: Food[]): void {
  foods.forEach(assertVerifiedNutritionSource);
}
