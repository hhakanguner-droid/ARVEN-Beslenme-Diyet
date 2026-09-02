export type GoalCalculationProvenance = {
  method: string;
  version: string;
  /** Structured inputs shown back to the user on the calculation-details screen. */
  inputs: Record<string, number | string | boolean | null>;
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

export function assertGoalCalculationProvenance(provenance: GoalCalculationProvenance): void {
  if (!provenance.method?.trim()) throw new Error("Goal calculation method is required");
  if (!provenance.version?.trim()) throw new Error("Goal calculation version is required");
  if (typeof provenance.inputs !== "object" || provenance.inputs == null || Array.isArray(provenance.inputs)) {
    throw new Error("Goal calculation inputs must be an object");
  }
  if (Object.keys(provenance.inputs).length === 0) {
    throw new Error("Goal calculation inputs cannot be empty");
  }
  if (!Array.isArray(provenance.referenceIds) || provenance.referenceIds.length === 0) {
    throw new Error("At least one scientific reference is required");
  }

  const seenReferences = new Set<string>();
  for (const referenceId of provenance.referenceIds) {
    if (!referenceId.trim()) throw new Error("Scientific reference id cannot be empty");
    if (seenReferences.has(referenceId)) throw new Error(`Duplicate scientific reference: ${referenceId}`);
    seenReferences.add(referenceId);
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
