import type { V1TransactionRunner } from "@/lib/persistence/v1-boundary";
import { V1NutritionReadRepository } from "@/lib/persistence/read-repositories";
import { assertCanonicalLocalDate, assertSevenDayLocalInterval } from "@/lib/time/canonical";

/** `weekStartLocalDate` plus 6 days, in the same "YYYY-MM-DD" canonical form used everywhere else in this codebase. */
function nextLocalDate(value: string, days: number, field = "date"): string {
  assertCanonicalLocalDate(value, field);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

/**
 * Deterministic weekly aggregate ARVEN's narrative-only WeeklyInsightV1 must be grounded in.
 * Every number here comes from `V1NutritionReadRepository.getDailySnapshot` — the same
 * per-day aggregate `Bugün` uses — never from the AI provider. This is the "deterministic
 * numeric truth" half of Phase 4's weekly insight feature; `lib/ai/contracts.ts`'s
 * `weeklyNarrative` guard is the other half, rejecting any AI-authored number so the two never
 * contradict each other.
 */
export type WeeklyMetricsV1 = {
  schemaVersion: "WeeklyMetricsV1";
  weekStartLocalDate: string;
  weekEndLocalDate: string;
  hasGoal: boolean;
  daysWithLoggedFood: number;
  averageEnergyKcal: number | null;
  averageProteinG: number | null;
  averageCarbsG: number | null;
  averageFatG: number | null;
  averageWaterMl: number;
  daysWaterGoalMet: number | null;
};

export async function computeWeeklyMetrics(
  runner: V1TransactionRunner,
  subject: string,
  weekStartLocalDate: string,
): Promise<WeeklyMetricsV1> {
  const weekEndLocalDate = nextLocalDate(weekStartLocalDate, 6, "weekStartLocalDate");
  assertSevenDayLocalInterval(weekStartLocalDate, weekEndLocalDate);

  const repository = new V1NutritionReadRepository(runner);
  const dates = Array.from({ length: 7 }, (_, i) => nextLocalDate(weekStartLocalDate, i, "weekStartLocalDate"));
  const snapshots = await Promise.all(dates.map((date) => repository.getDailySnapshot(subject, date)));

  const loggedDays = snapshots.filter((s) => s.consumptionCoverage === "logged-foods");
  const hasGoal = snapshots.some((s) => s.targets !== null);
  const waterGoalMl = snapshots.find((s) => s.targets?.waterMl != null)?.targets?.waterMl ?? null;

  return {
    schemaVersion: "WeeklyMetricsV1",
    weekStartLocalDate,
    weekEndLocalDate,
    hasGoal,
    daysWithLoggedFood: loggedDays.length,
    averageEnergyKcal: average(loggedDays.map((s) => s.consumed.energyKcal)),
    averageProteinG: average(loggedDays.map((s) => s.consumed.proteinG)),
    averageCarbsG: average(loggedDays.map((s) => s.consumed.carbsG)),
    averageFatG: average(loggedDays.map((s) => s.consumed.fatG)),
    averageWaterMl: average(snapshots.map((s) => s.waterMl)) ?? 0,
    daysWaterGoalMet: waterGoalMl == null ? null : snapshots.filter((s) => s.waterMl >= waterGoalMl).length,
  };
}
