import type {
  AuthenticatedSubject,
  DailyNutritionSnapshot,
  FoodReadRepository,
  FoodSearchOptions,
  NutritionReadRepository,
} from "@/lib/persistence/contracts";
import type { ConsumptionCoverage, Food, NutritionFacts } from "@/lib/nutrition/types";
import { deriveNutritionLocalDate } from "@/lib/persistence/v1-boundary";
import { previousLocalDate } from "@/lib/time/canonical";
import type { V1TransactionRunner } from "@/lib/persistence/v1-boundary";

type MealEventItemPayload = { nutrition: { energyKcal: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number }; foodVersionId: string };
type MealEventPayload = { schemaVersion: "MealEventV1"; mealType: string; items: MealEventItemPayload[] };
type WaterEventPayload = { schemaVersion: "WaterEventV1"; milliliters: number };

function zeroFacts(): NutritionFacts {
  return { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
}
function addFacts(a: NutritionFacts, b: NutritionFacts): NutritionFacts {
  return { energyKcal: a.energyKcal + b.energyKcal, proteinG: a.proteinG + b.proteinG, carbsG: a.carbsG + b.carbsG, fatG: a.fatG + b.fatG, fiberG: (a.fiberG ?? 0) + (b.fiberG ?? 0) };
}

/** Backs `contracts.ts`'s `NutritionReadRepository` — the exact read shape `Bugün` needs. */
export class V1NutritionReadRepository implements NutritionReadRepository {
  constructor(private readonly runner: V1TransactionRunner) {}

  async getDailySnapshot(subject: AuthenticatedSubject, localDate: string): Promise<DailyNutritionSnapshot> {
    return this.runner.transaction(async (tx) => {
      const [goal, events] = await Promise.all([
        tx.getCurrentGoalVersion(subject),
        tx.listNutritionEventsForLocalDate(subject, localDate),
      ]);

      let consumed = zeroFacts();
      let waterMl = 0;
      let hasMealEvent = false;
      for (const event of events) {
        if (event.eventType === "meal-log") {
          hasMealEvent = true;
          let payload: MealEventPayload;
          try { payload = JSON.parse(event.payloadJson) as MealEventPayload; } catch { continue; }
          for (const item of payload.items ?? []) consumed = addFacts(consumed, item.nutrition);
        } else if (event.eventType === "water-log") {
          let payload: WaterEventPayload;
          try { payload = JSON.parse(event.payloadJson) as WaterEventPayload; } catch { continue; }
          waterMl += payload.milliliters;
        }
      }
      const consumptionCoverage: ConsumptionCoverage = hasMealEvent ? "logged-foods" : "empty-day";

      return {
        date: localDate,
        targets: goal ? { energyKcal: goal.energyKcal, proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG, fiberG: goal.fiberG, waterMl: goal.waterMl } : null,
        consumed,
        consumptionCoverage,
        waterMl,
      };
    });
  }
}

/** Backs `contracts.ts`'s `FoodReadRepository`, reading exclusively through the authenticated `V1Transaction`. */
export class V1FoodReadRepository implements FoodReadRepository {
  constructor(private readonly runner: V1TransactionRunner) {}

  async findById(subject: AuthenticatedSubject, id: string): Promise<Food | null> {
    return this.runner.transaction((tx) => tx.getFoodVersion(subject, id));
  }

  async findByBarcode(subject: AuthenticatedSubject, barcode: string): Promise<Food | null> {
    return this.runner.transaction((tx) => tx.findFoodVersionByBarcode(subject, barcode));
  }

  async searchVerified(subject: AuthenticatedSubject, query: string, options?: FoodSearchOptions): Promise<Food[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return this.runner.transaction((tx) => tx.searchFoodVersions(subject, trimmed, options?.limit ?? 20));
  }

  /** Best-effort: walks back a bounded number of local calendar days collecting distinct meal-logged foods. */
  async getRecentlyLogged(subject: AuthenticatedSubject, limit = 10): Promise<Food[]> {
    return this.runner.transaction(async (tx) => {
      const context = await tx.getUserContext(subject).catch(() => null);
      if (!context) return [];
      let date = deriveNutritionLocalDate(new Date().toISOString(), context.timezone, context.nutritionDayStartMinutes);
      const seen = new Set<string>();
      const foods: Food[] = [];
      for (let day = 0; day < 14 && foods.length < limit; day++) {
        const events = await tx.listNutritionEventsForLocalDate(subject, date);
        for (const event of events) {
          if (event.eventType !== "meal-log") continue;
          let payload: MealEventPayload;
          try { payload = JSON.parse(event.payloadJson) as MealEventPayload; } catch { continue; }
          for (const item of payload.items ?? []) {
            if (seen.has(item.foodVersionId) || foods.length >= limit) continue;
            seen.add(item.foodVersionId);
            const food = await tx.getFoodVersion(subject, item.foodVersionId);
            if (food) foods.push(food);
          }
        }
        date = previousLocalDate(date);
      }
      return foods;
    });
  }
}
