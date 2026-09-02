import { assertGoalCalculationProvenance, type GoalCalculationProvenance } from "./types";

export type CalculatedGoalTargets = {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterMl: number;
};

export type MifflinStJeorV1Inputs = {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sexAtBirth: "male" | "female";
  activityFactor: number;
  energyAdjustmentKcal: number;
  proteinGPerKg: number;
  fatEnergyPct: number;
  waterMlPerKg: number;
};

function finiteInRange(value: number, min: number, max: number, field: string): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${field} is outside supported range`);
  return value;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function deriveMifflinStJeorV1(inputs: MifflinStJeorV1Inputs): CalculatedGoalTargets {
  const weightKg = finiteInRange(inputs.weightKg, 20, 400, "weightKg");
  const heightCm = finiteInRange(inputs.heightCm, 100, 260, "heightCm");
  const ageYears = finiteInRange(inputs.ageYears, 18, 120, "ageYears");
  const activityFactor = finiteInRange(inputs.activityFactor, 1, 2.5, "activityFactor");
  const energyAdjustmentKcal = finiteInRange(inputs.energyAdjustmentKcal, -1500, 1500, "energyAdjustmentKcal");
  const proteinGPerKg = finiteInRange(inputs.proteinGPerKg, 0.5, 4, "proteinGPerKg");
  const fatEnergyPct = finiteInRange(inputs.fatEnergyPct, 0.15, 0.5, "fatEnergyPct");
  const waterMlPerKg = finiteInRange(inputs.waterMlPerKg, 15, 60, "waterMlPerKg");
  if (inputs.sexAtBirth !== "male" && inputs.sexAtBirth !== "female") throw new Error("sexAtBirth is unsupported");

  const sexOffset = inputs.sexAtBirth === "male" ? 5 : -161;
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * ageYears) + sexOffset;
  const energyKcal = round((bmr * activityFactor) + energyAdjustmentKcal, 0);
  const proteinG = round(weightKg * proteinGPerKg, 1);
  const fatG = round((energyKcal * fatEnergyPct) / 9, 1);
  const carbsG = round(Math.max(0, (energyKcal - (proteinG * 4) - (fatG * 9)) / 4), 1);
  const fiberG = round((energyKcal / 1000) * 14, 1);
  const waterMl = round(weightKg * waterMlPerKg, 0);

  return { energyKcal, proteinG, carbsG, fatG, fiberG, waterMl };
}

export function deriveCalculatedGoal(
  provenance: GoalCalculationProvenance,
): CalculatedGoalTargets {
  assertGoalCalculationProvenance(provenance);
  if (provenance.method !== "mifflin-st-jeor" || provenance.version !== "v1") {
    throw new Error(`Unsupported goal calculator ${provenance.method}@${provenance.version}`);
  }
  return deriveMifflinStJeorV1(provenance.inputs as unknown as MifflinStJeorV1Inputs);
}
