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

function finiteSignedOrNull(value: number | null | undefined, field: string): void {
  if (value == null) return;
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite or null`);
}

function finiteNonNegativeOrNull(value: number | null | undefined, field: string): void {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be finite and non-negative or null`);
}

export function assertWeeklyInsightMetrics(metrics: WeeklyInsightMetrics): void {
  finiteNonNegativeOrNull(metrics.adherencePercent, "adherencePercent");
  finiteNonNegativeOrNull(metrics.averageEnergyKcal, "averageEnergyKcal");
  finiteNonNegativeOrNull(metrics.averageProteinG, "averageProteinG");
  finiteNonNegativeOrNull(metrics.averageWaterMl, "averageWaterMl");
  finiteSignedOrNull(metrics.weightChangeKg, "weightChangeKg");
  finiteNonNegativeOrNull(metrics.averageSleepHours, "averageSleepHours");
  finiteNonNegativeOrNull(metrics.averageSteps, "averageSteps");

  if (!Number.isInteger(metrics.loggedDays) || metrics.loggedDays < 0 || metrics.loggedDays > 7) {
    throw new Error("loggedDays must be an integer between 0 and 7");
  }
  if (!Number.isInteger(metrics.plannedDays) || metrics.plannedDays < 0 || metrics.plannedDays > 7) {
    throw new Error("plannedDays must be an integer between 0 and 7");
  }
  if (metrics.adherencePercent != null && metrics.adherencePercent > 100) {
    throw new Error("adherencePercent must be between 0 and 100");
  }
  if (metrics.averageSleepHours != null && metrics.averageSleepHours > 24) {
    throw new Error("averageSleepHours cannot exceed 24");
  }

  if (metrics.loggedDays === 0 && (
    metrics.averageEnergyKcal != null
    || metrics.averageProteinG != null
    || metrics.averageWaterMl != null
  )) {
    throw new Error("nutrition averages must be null when loggedDays is zero");
  }

  if (metrics.plannedDays === 0 && metrics.adherencePercent != null) {
    throw new Error("adherencePercent must be null when plannedDays is zero");
  }
}
