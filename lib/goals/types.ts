import { z } from "zod";

export type GoalCalculationScalar = number | string | boolean | null;

export type GoalCalculationProvenance = {
  method: string;
  version: string;
  /** Structured primitive inputs shown back to the user on the calculation-details screen. */
  inputs: Record<string, GoalCalculationScalar>;
  /** Stable internal IDs that map to published scientific references. */
  referenceIds: string[];
};

export const MEAL_TYPES = [
  "breakfast",
  "morning-snack",
  "lunch",
  "afternoon-snack",
  "dinner",
  "snack",
  "custom",
] as const;

export type MealType = typeof MEAL_TYPES[number];
const MEAL_TYPE_SET = new Set<string>(MEAL_TYPES);

export type MealEnergyAllocation = {
  mealType: MealType;
  /** Basis points: 2500 = 25.00%. All allocations for a goal must total 10,000. */
  energyShareBps: number;
};

const MealEnergyAllocationSchema = z.object({
  mealType: z.enum(MEAL_TYPES),
  energyShareBps: z.number().int().min(0).max(10000),
}).strict();

const MealEnergyAllocationsSchema = z.array(MealEnergyAllocationSchema).min(1);

export function parseMealEnergyAllocations(value: unknown): MealEnergyAllocation[] {
  const allocations = MealEnergyAllocationsSchema.parse(value);
  assertMealEnergyAllocations(allocations);
  return allocations;
}

export function assertGoalCalculationProvenance(provenance: GoalCalculationProvenance): void {
  if (!provenance.method?.trim()) throw new Error("Goal calculation method is required");
  if (!provenance.version?.trim()) throw new Error("Goal calculation version is required");
  if (typeof provenance.inputs !== "object" || provenance.inputs == null || Array.isArray(provenance.inputs)) {
    throw new Error("Goal calculation inputs must be an object");
  }
  const entries = Object.entries(provenance.inputs as Record<string, unknown>);
  if (entries.length === 0) throw new Error("Goal calculation inputs cannot be empty");
  for (const [key, value] of entries) {
    if (!key.trim()) throw new Error("Goal calculation input keys cannot be blank");
    const type = typeof value;
    if (value !== null && type !== "number" && type !== "string" && type !== "boolean") {
      throw new Error(`Goal calculation input ${key} must be a primitive scalar`);
    }
    if (type === "number" && !Number.isFinite(value as number)) {
      throw new Error(`Goal calculation input ${key} must be finite`);
    }
    if (type === "string" && !(value as string).trim()) {
      throw new Error(`Goal calculation input ${key} cannot be blank`);
    }
  }
  if (!Array.isArray(provenance.referenceIds) || provenance.referenceIds.length === 0) {
    throw new Error("At least one scientific reference is required");
  }

  const seenReferences = new Set<string>();
  for (const referenceId of provenance.referenceIds) {
    const canonical = referenceId.trim();
    if (!canonical) throw new Error("Scientific reference id cannot be empty");
    if (seenReferences.has(canonical)) throw new Error(`Duplicate scientific reference: ${canonical}`);
    seenReferences.add(canonical);
  }
}

export function assertMealEnergyAllocations(allocations: MealEnergyAllocation[]): void {
  if (allocations.length === 0) throw new Error("At least one meal allocation is required");
  const seen = new Set<MealType>();
  let total = 0;

  for (const allocation of allocations) {
    const rawMealType = allocation.mealType as string;
    if (rawMealType !== rawMealType.trim() || !MEAL_TYPE_SET.has(rawMealType)) {
      throw new Error(`Invalid mealType: ${rawMealType}`);
    }
    const mealType = rawMealType as MealType;
    if (seen.has(mealType)) throw new Error(`Duplicate meal allocation: ${mealType}`);
    seen.add(mealType);

    if (!Number.isInteger(allocation.energyShareBps) || allocation.energyShareBps < 0 || allocation.energyShareBps > 10000) {
      throw new Error("energyShareBps must be an integer between 0 and 10000");
    }
    total += allocation.energyShareBps;
  }

  if (total !== 10000) throw new Error(`Meal allocations must total 10000 basis points; got ${total}`);
}
