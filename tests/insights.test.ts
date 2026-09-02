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

test("empty weeks keep nutrition averages and adherence unknown", () => {
  assert.doesNotThrow(() => assertWeeklyInsightMetrics({
    ...validMetrics,
    loggedDays: 0,
    plannedDays: 0,
    adherencePercent: null,
    averageEnergyKcal: null,
    averageProteinG: null,
    averageWaterMl: null,
  }));

  assert.throws(() => assertWeeklyInsightMetrics({
    ...validMetrics,
    loggedDays: 0,
    averageEnergyKcal: 2000,
  }), /nutrition averages must be null/);

  assert.throws(() => assertWeeklyInsightMetrics({
    ...validMetrics,
    plannedDays: 0,
    adherencePercent: 90,
  }), /adherencePercent must be null/);
});
