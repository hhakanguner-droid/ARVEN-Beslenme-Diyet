export type WeeklyInsightMetrics = {
  localWeekStart: string;
  localWeekEnd: string;
  loggedDays: number;
  plannedDays: number;
  adherencePercent: number | null;
  averageEnergyKcal: number | null;
  averageProteinG: number | null;
  averageWaterMl: number | null;
  weightChangeKg: number | null;
  /** Optional future integrations; absent values remain unknown rather than zero. */
  averageSleepHours?: number | null;
  averageSteps?: number | null;
};

export function assertWeeklyInsightMetrics(metrics: WeeklyInsightMetrics): void {
  const finiteOrNull = (value: number | null | undefined, field: string) => {
    if (value == null) return;
    if (!Number.isFinite(value)) throw new Error(`${field} must be finite or null`);
  };

  finiteOrNull(metrics.adherencePercent, "adherencePercent");
  finiteOrNull(metrics.averageEnergyKcal, "averageEnergyKcal");
  finiteOrNull(metrics.averageProteinG, "averageProteinG");
  finiteOrNull(metrics.averageWaterMl, "averageWaterMl");
  finiteOrNull(metrics.weightChangeKg, "weightChangeKg");
  finiteOrNull(metrics.averageSleepHours, "averageSleepHours");
  finiteOrNull(metrics.averageSteps, "averageSteps");

  if (!Number.isInteger(metrics.loggedDays) || metrics.loggedDays < 0 || metrics.loggedDays > 7) {
    throw new Error("loggedDays must be an integer between 0 and 7");
  }
  if (!Number.isInteger(metrics.plannedDays) || metrics.plannedDays < 0 || metrics.plannedDays > 7) {
    throw new Error("plannedDays must be an integer between 0 and 7");
  }
  if (metrics.adherencePercent != null && (metrics.adherencePercent < 0 || metrics.adherencePercent > 100)) {
    throw new Error("adherencePercent must be between 0 and 100");
  }
}
