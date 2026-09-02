import type { Food, NutritionFacts, NutritionTargets, Portion } from "@/lib/nutrition/types";

export type UserId = string;

export type DailyNutritionSnapshot = {
  date: string;
  targets: NutritionTargets | null;
  consumed: NutritionFacts;
  waterMl: number;
};

export interface FoodRepository {
  findById(id: string): Promise<Food | null>;
  searchVerified(query: string, limit?: number): Promise<Food[]>;
}

export interface NutritionLogRepository {
  getDailySnapshot(userId: UserId, localDate: string): Promise<DailyNutritionSnapshot>;
  appendMeal(userId: UserId, localDate: string, portions: Portion[]): Promise<string>;
  appendWater(userId: UserId, occurredAt: string, milliliters: number): Promise<string>;
}

export interface UserContextRepository {
  getActiveAllergies(userId: UserId): Promise<string[]>;
  getActiveTargets(userId: UserId, localDate: string): Promise<NutritionTargets | null>;
}
