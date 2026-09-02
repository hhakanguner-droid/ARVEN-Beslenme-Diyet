import type { Food, NutritionSource } from "./types";

const ALLOWED_PROVIDERS = new Set<NutritionSource["provider"]>([
  "open-food-facts",
  "usda",
  "turkomp",
  "manual-verified",
]);

export function assertVerifiedNutritionSource(food: Food): void {
  const source = food.source;
  if (!source || !ALLOWED_PROVIDERS.has(source.provider)) {
    throw new Error(`Food ${food.id} does not have an allowed nutrition source`);
  }

  const verifiedAt = Date.parse(source.verifiedAt);
  if (!Number.isFinite(verifiedAt)) {
    throw new Error(`Food ${food.id} has an invalid verifiedAt timestamp`);
  }

  if (source.provider !== "manual-verified" && !source.externalId) {
    throw new Error(`Food ${food.id} is missing its external source id`);
  }
}

export function assertFoodsVerified(foods: Food[]): void {
  foods.forEach(assertVerifiedNutritionSource);
}
