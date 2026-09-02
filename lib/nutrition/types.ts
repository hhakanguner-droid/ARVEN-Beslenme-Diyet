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

export type Food = {
  id: string;
  name: string;
  basisGrams: 100;
  nutrition: NutritionFacts;
  source: NutritionSource;
};

export type Portion = {
  food: Food;
  grams: number;
};

export type NutritionTargets = NutritionFacts & {
  waterMl?: number;
};
