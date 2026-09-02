import assert from "node:assert/strict";
import test from "node:test";
import { assertWeeklyInsightMetrics } from "../lib/insights/types";

const validMetrics = {
  localWeekStart: "2026-08-31",
  localWeekEnd: "2026-09-06",
  loggedDays: 5,
  plannedDays: 7,
  adherencePercent: 82,
  averageEnergyKcal: 2100,
  averageProteinG: 145,
  averageWaterMl: 2200,
  weightChangeKg: -0.4,
  averageSleepHours: 7.2,
  averageSteps: 8400,
};

test("weekly deterministic metrics accept signed weight change but non-negative consumption/activity values", () => {
  assert.doesNotThrow(() => assertWeeklyInsightMetrics(validMetrics));
  assert.doesNotThrow(() => assertWeeklyInsightMetrics({ ...validMetrics, weightChangeKg: -1.2 }));
});

test("negative weekly consumption metrics are rejected before AI narrative", () => {
  const fields = [
    "averageEnergyKcal",
    "averageProteinG",
    "averageWaterMl",
    "averageSleepHours",
    "averageSteps",
  ] as const;

  for (const field of fields) {
    assert.throws(
      () => assertWeeklyInsightMetrics({ ...validMetrics, [field]: -1 }),
      /non-negative/,
      field,
    );
  }
});
