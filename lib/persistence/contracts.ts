import type { DietarySafetyExclusion } from "@/lib/health-safety/policy";
import type { UserNutritionPreferences } from "@/lib/preferences/types";
import type {
  ConsumptionCoverage,
  Food,
  NutritionFacts,
  NutritionSourceProvider,
  NutritionTargets,
} from "@/lib/nutrition/types";

/** Server-authenticated external subject. Write APIs do not accept arbitrary owners. */
export type AuthenticatedSubject = string;

export type DailyNutritionSnapshot = {
  date: string;
  targets: NutritionTargets | null;
  consumed: NutritionFacts;
  consumptionCoverage: ConsumptionCoverage;
  waterMl: number;
};

export type FoodSearchOptions = {
  limit?: number;
  enabledProviders?: NutritionSourceProvider[];
};

/**
 * Read-only food access. Implementations expose global food versions plus private
 * versions owned by the authenticated subject. All writes/version creation live
 * behind V1MutationService and its transaction adapter.
 */
export interface FoodReadRepository {
  findById(subject: AuthenticatedSubject, id: string): Promise<Food | null>;
  findByBarcode(subject: AuthenticatedSubject, barcode: string): Promise<Food | null>;
  searchVerified(subject: AuthenticatedSubject, query: string, options?: FoodSearchOptions): Promise<Food[]>;
  getRecentlyLogged(subject: AuthenticatedSubject, limit?: number): Promise<Food[]>;
}

/** Nutrition history reads only. No alternate append/update/delete path exists. */
export interface NutritionReadRepository {
  getDailySnapshot(subject: AuthenticatedSubject, localDate: string): Promise<DailyNutritionSnapshot>;
}

/**
 * Recommendation context is authenticated and includes every hard safety input.
 * Medication data is intentionally absent: ARVEN does not store/track medications.
 */
export interface UserContextReadRepository {
  getActiveAllergenIds(subject: AuthenticatedSubject): Promise<string[]>;
  getActiveDietarySafetyExclusions(subject: AuthenticatedSubject): Promise<DietarySafetyExclusion[]>;
  getActiveTargets(subject: AuthenticatedSubject, localDate: string): Promise<NutritionTargets | null>;
  getNutritionPreferences(subject: AuthenticatedSubject): Promise<UserNutritionPreferences>;
}
