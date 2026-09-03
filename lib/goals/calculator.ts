import { z } from "zod";
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

const MifflinStJeorV1InputSchema = z.object({
  weightKg: z.number().finite(),
  heightCm: z.number().finite(),
  ageYears: z.number().finite(),
  sexAtBirth: z.enum(["male", "female"]),
  activityFactor: z.number().finite(),
  energyAdjustmentKcal: z.number().finite(),
  proteinGPerKg: z.number().finite(),
  fatEnergyPct: z.number().finite(),
  waterMlPerKg: z.number().finite(),
}).strict();

export function parseMifflinStJeorV1Inputs(value: unknown): MifflinStJeorV1Inputs {
  return MifflinStJeorV1InputSchema.parse(value);
}

function finiteInRange(value: number, min: number, max: number, field: string): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${field} is outside supported range`);
  return value;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function assertDerivedTargets(targets: CalculatedGoalTargets): void {
  finiteInRange(targets.energyKcal, 1, 20_000, "derived energyKcal");
  finiteInRange(targets.proteinG, 0, 2_000, "derived proteinG");
  finiteInRange(targets.carbsG, 0, 3_000, "derived carbsG");
  finiteInRange(targets.fatG, 0, 2_000, "derived fatG");
  finiteInRange(targets.fiberG, 0, 1_000, "derived fiberG");
  finiteInRange(targets.waterMl, 0, 20_000, "derived waterMl");
  const macroEnergyKcal = (targets.proteinG * 4) + (targets.carbsG * 4) + (targets.fatG * 9);
  if (macroEnergyKcal > targets.energyKcal + 5) {
    throw new Error("Derived macro targets exceed the derived energy target");
  }
}

export function deriveMifflinStJeorV1(rawInputs: MifflinStJeorV1Inputs): CalculatedGoalTargets {
  const inputs = parseMifflinStJeorV1Inputs(rawInputs);
  const weightKg = finiteInRange(inputs.weightKg, 20, 400, "weightKg");
  const heightCm = finiteInRange(inputs.heightCm, 100, 260, "heightCm");
  const ageYears = finiteInRange(inputs.ageYears, 18, 120, "ageYears");
  const activityFactor = finiteInRange(inputs.activityFactor, 1, 2.5, "activityFactor");
  const energyAdjustmentKcal = finiteInRange(inputs.energyAdjustmentKcal, -1500, 1500, "energyAdjustmentKcal");
  const proteinGPerKg = finiteInRange(inputs.proteinGPerKg, 0.5, 4, "proteinGPerKg");
  const fatEnergyPct = finiteInRange(inputs.fatEnergyPct, 0.15, 0.5, "fatEnergyPct");
  const waterMlPerKg = finiteInRange(inputs.waterMlPerKg, 15, 60, "waterMlPerKg");

  const sexOffset = inputs.sexAtBirth === "male" ? 5 : -161;
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * ageYears) + sexOffset;
  const energyKcal = round((bmr * activityFactor) + energyAdjustmentKcal, 0);
  const proteinG = round(weightKg * proteinGPerKg, 1);
  const fatG = round((energyKcal * fatEnergyPct) / 9, 1);
  const remainingEnergyKcal = energyKcal - (proteinG * 4) - (fatG * 9);
  if (remainingEnergyKcal < -5) {
    throw new Error("Goal inputs are internally inconsistent: protein and fat targets exceed available energy");
  }
  const carbsG = round(Math.max(0, remainingEnergyKcal / 4), 1);
  const fiberG = round((energyKcal / 1000) * 14, 1);
  const waterMl = round(weightKg * waterMlPerKg, 0);
  const targets = { energyKcal, proteinG, carbsG, fatG, fiberG, waterMl };
  assertDerivedTargets(targets);
  return targets;
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
