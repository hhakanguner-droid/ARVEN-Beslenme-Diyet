export type GoalCalculationProvenance = {
  method: string;
  version: string;
  /** Structured inputs shown back to the user on the calculation-details screen. */
  inputs: Record<string, number | string | boolean | null>;
  /** Stable internal IDs that map to published scientific references. */
  referenceIds: string[];
};

export type MealEnergyAllocation = {
  mealType: string;
  /** Basis points: 2500 = 25.00%. All allocations for a goal must total 10,000. */
  energyShareBps: number;
};

export function assertMealEnergyAllocations(allocations: MealEnergyAllocation[]): void {
  if (allocations.length === 0) throw new Error("At least one meal allocation is required");
  const seen = new Set<string>();
  let total = 0;

  for (const allocation of allocations) {
    if (!allocation.mealType.trim()) throw new Error("mealType is required");
    if (seen.has(allocation.mealType)) throw new Error(`Duplicate meal allocation: ${allocation.mealType}`);
    seen.add(allocation.mealType);

    if (!Number.isInteger(allocation.energyShareBps) || allocation.energyShareBps < 0 || allocation.energyShareBps > 10000) {
      throw new Error("energyShareBps must be an integer between 0 and 10000");
    }
    total += allocation.energyShareBps;
  }

  if (total !== 10000) throw new Error(`Meal allocations must total 10000 basis points; got ${total}`);
}
