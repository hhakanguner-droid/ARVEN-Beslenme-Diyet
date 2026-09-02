import type { DietarySafetyExclusion } from "@/lib/health-safety/policy";
import type { UserNutritionPreferences } from "@/lib/preferences/types";
import type {
  ConsumptionCoverage,
  Food,
  NutritionFacts,
  NutritionSourceProvider,
  NutritionTargets,
  Portion,
} from "@/lib/nutrition/types";

export type UserId = string;

export type MealType =
  | "breakfast"
  | "morning-snack"
  | "lunch"
  | "afternoon-snack"
  | "dinner"
  | "snack"
  | "custom";

export type DailyNutritionSnapshot = {
  date: string;
  targets: NutritionTargets | null;
  consumed: NutritionFacts;
  /** Explicitly distinguishes no logged foods from logged foods with incomplete micronutrient data. */
  consumptionCoverage: ConsumptionCoverage;
  waterMl: number;
};

export type FoodSearchOptions = {
  limit?: number;
  enabledProviders?: NutritionSourceProvider[];
};

export type AppendMealCommand = {
  localDate: string;
  /** User-confirmed occurrence instant (ISO-8601). */
  occurredAt: string;
  mealType: MealType;
  portions: Portion[];
};

/**
 * Food access is always explicitly authenticated. Implementations must expose
 * global foods plus private foods owned by this internal user only.
 */
export interface FoodRepository {
  findById(userId: UserId, id: string): Promise<Food | null>;
  findByBarcode(userId: UserId, barcode: string): Promise<Food | null>;
  searchVerified(userId: UserId, query: string, options?: FoodSearchOptions): Promise<Food[]>;
  getRecentlyLogged(userId: UserId, limit?: number): Promise<Food[]>;
}

export interface NutritionLogRepository {
  getDailySnapshot(userId: UserId, localDate: string): Promise<DailyNutritionSnapshot>;
  appendMeal(userId: UserId, command: AppendMealCommand): Promise<string>;
  appendWater(userId: UserId, occurredAt: string, milliliters: number): Promise<string>;
  /** Supports a humane quick-add water UX with one-step correction. */
  removeLatestWater(userId: UserId, localDate: string): Promise<boolean>;
}

/**
 * Recommendation context is authenticated and includes every hard safety input
 * needed for nutrition recommendations. Medication data is intentionally absent:
 * ARVEN does not store or track medications.
 */
export interface UserContextRepository {
  getActiveAllergenIds(userId: UserId): Promise<string[]>;
  getActiveDietarySafetyExclusions(userId: UserId): Promise<DietarySafetyExclusion[]>;
  getActiveTargets(userId: UserId, localDate: string): Promise<NutritionTargets | null>;
  getNutritionPreferences(userId: UserId): Promise<UserNutritionPreferences>;
}
