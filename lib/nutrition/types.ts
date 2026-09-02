export type NutritionFacts = {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
};

export type NutritionSource = {
  provider: "open-food-facts" | "usda" | "turkomp" | "manual-verified";
  externalId?: string;
  verifiedAt: string;
  evidenceUrl?: string;
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

export type Food = {
  id: string;
  name: string;
  basisGrams: 100;
  nutrition: NutritionFacts;
  source: NutritionSource;
  portionOptions?: FoodPortionOption[];
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
