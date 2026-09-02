import type { ExtendedNutritionFacts } from "./nutrients";

export type NutritionFacts = {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Undefined means the source does not provide a trustworthy fibre value. */
  fiberG?: number;
  /** Optional extended nutrients preserve complete/partial/unknown state per nutrient. */
  extended?: ExtendedNutritionFacts;
};

/** Distinguishes a genuinely empty day from logged foods with incomplete nutrient coverage. */
export type ConsumptionCoverage = "logged-foods" | "empty-day";

export type NutritionSourceProvider =
  | "open-food-facts"
  | "usda"
  | "turkomp"
  | "bls"
  | "swiss-fcd"
  | "manual-verified";

export type NutritionSource = {
  provider: NutritionSourceProvider;
  externalId?: string;
  verifiedAt: string;
  evidenceUrl?: string;
  licenseId?: string;
};

export type PortionMeasure =
  | "piece"
  | "slice"
  | "teaspoon"
  | "tablespoon"
  | "tea-glass"
  | "water-glass"
  | "cup"
  | "bowl"
  | "handful"
  | "palm"
  | "serving"
  | "package"
  | "bottle"
  | "can"
  | "ladle";

export type PortionSize = "small" | "medium" | "large";

/**
 * A user-facing household/visual measure with a verified gram equivalent.
 * gramsPerUnit is internal numeric truth; label is what the person sees.
 */
export type FoodPortionOption = {
  id: string;
  measure: PortionMeasure;
  size?: PortionSize;
  label: string;
  gramsPerUnit: number;
  source: NutritionSource;
};

export type SafetyDataStatus = "verified" | "unknown" | "not-applicable";
export type AllergenDataStatus = SafetyDataStatus;

export type Food = {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  isLiquid?: boolean;
  basisGrams: 100;
  nutrition: NutritionFacts;
  source: NutritionSource;
  portionOptions?: FoodPortionOption[];
  /** Stable allergen identifiers resolved from verified source data. */
  allergenIds?: string[];
  allergenDataStatus?: AllergenDataStatus;
  /** Stable dietary-rule ids that this food conflicts with, e.g. vegetarian/vegan. */
  dietaryConflictRuleIds?: string[];
  dietarySafetyDataStatus?: SafetyDataStatus;
};

/**
 * Resolved portion consumed by the deterministic calculation engine.
 * UI selections are converted to grams before calculations run.
 */
export type Portion = {
  food: Food;
  grams: number;
  display?: {
    portionOptionId?: string;
    quantity?: number;
    label: string;
  };
};

export type PortionSelection =
  | {
      kind: "household";
      portionOptionId: string;
      quantity: number;
    }
  | {
      kind: "custom-grams";
      grams: number;
    };

export type NutritionTargets = NutritionFacts & {
  waterMl?: number;
};
