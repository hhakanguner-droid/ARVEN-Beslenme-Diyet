import type { Food, NutritionSource, NutritionSourceProvider } from "./types";

const ALLOWED_PROVIDERS = new Set<NutritionSourceProvider>([
  "open-food-facts",
  "usda",
  "turkomp",
  "bls",
  "swiss-fcd",
  "manual-verified",
]);

function isCanonicalUtcInstant(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/.exec(value);
  if (!match) return false;
  const [, y, mo, d, h, mi, s, ms = "000"] = match;
  const parts = [y, mo, d, h, mi, s, ms].map(Number);
  if (parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return false;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5], parts[6]));
  return date.getUTCFullYear() === parts[0]
    && date.getUTCMonth() + 1 === parts[1]
    && date.getUTCDate() === parts[2]
    && date.getUTCHours() === parts[3]
    && date.getUTCMinutes() === parts[4]
    && date.getUTCSeconds() === parts[5]
    && date.getUTCMilliseconds() === parts[6];
}

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

  for (const option of food.portionOptions ?? []) {
    if (!Number.isFinite(option.gramsPerUnit) || option.gramsPerUnit <= 0) {
      throw new Error(`Portion option ${option.id} has an invalid gramsPerUnit`);
    }
    assertSource(option.source, `Portion option ${option.id}`);
  }
}

export function assertFoodsVerified(foods: Food[]): void {
  foods.forEach(assertVerifiedNutritionSource);
}
