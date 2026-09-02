export type EnergyUnit = "kcal" | "kj";

export type HomeCardId =
  | "calendar"
  | "daily-goals"
  | "today-meals"
  | "water"
  | "weekly-insight";

export const DEFAULT_HOME_CARD_ORDER: readonly HomeCardId[] = [
  "calendar",
  "daily-goals",
  "today-meals",
];

export type UserNutritionPreferences = {
  energyUnit: EnergyUnit;
  /** Minutes after midnight at which a nutrition day begins. Default: 0. */
  nutritionDayStartMinutes: number;
  homeCardOrder: HomeCardId[];
  preferredNutrientKeys: string[];
};
