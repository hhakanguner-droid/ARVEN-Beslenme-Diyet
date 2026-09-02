export type ResolvedFoodAllergens = {
  foodId: string;
  foodName: string;
  allergenDataStatus: "verified" | "unknown" | "not-applicable";
  allergenIds: string[];
};

export type MedicalSafetyContext = {
  /** Active medication names/brands resolved from the authenticated user's records. */
  medicationNames?: readonly string[];
};

export type DietarySafetyExclusion = {
  kind: "food" | "rule";
  /** Resolved food id or dietary-rule id. Null means the exclusion still needs resolution. */
  id: string | null;
  label: string;
  resolutionStatus: "resolved" | "unresolved";
};

export type ResolvedFoodDietarySafety = {
  foodId: string;
  foodName: string;
  dietarySafetyDataStatus: "verified" | "unknown" | "not-applicable";
  /** Stable dietary-rule ids that this candidate conflicts with. */
  dietaryConflictRuleIds: string[];
};

function normalizeTurkishText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

const MEDICATION_CONTEXT = ["ilac", "ilaclar", "ilac kullanimi", "medikasyon", "recete", "doz"];

const DIRECT_MEDICAL_PATTERNS = [
  /\btani\s+koy/,
  /\btedavi\w*\s+(basla|uygula|degistir|durdur)/,
  /\brecete\b/,
];

function mentionsKnownMedication(normalizedText: string, medicationNames: readonly string[]): boolean {
  return medicationNames.some((name) => {
    const normalizedName = normalizeTurkishText(name);
    return normalizedName.length >= 3 && normalizedText.includes(normalizedName);
  });
}

/**
 * AI-generated coaching text is not allowed to manage medication at all.
 * The guard intentionally fails closed whenever the model mentions a generic
 * medication-management concept or one of the authenticated user's active
 * medication names. Any safe medication notice must be deterministic,
 * server-authored copy outside the model output. This avoids an endless and
 * incomplete list of imperative verbs such as "bırak", "alma" or "atla".
 */
export function assertNoMedicalOverreach(text: string, context: MedicalSafetyContext = {}): void {
  const normalized = normalizeTurkishText(text);
  const genericMedicationContext = MEDICATION_CONTEXT.some((term) => normalized.includes(term));
  const namedMedicationContext = mentionsKnownMedication(normalized, context.medicationNames ?? []);
  const directOverreach = DIRECT_MEDICAL_PATTERNS.some((pattern) => pattern.test(normalized));

  if (genericMedicationContext || namedMedicationContext || directOverreach) {
    throw new Error("AI output violates ARVEN non-diagnostic health policy");
  }
}

/**
 * Allergy decisions are identifier based, never food-name substring based.
 * If a user has active allergies, foods with unknown allergen data are blocked
 * until they are resolved against a verified catalog/source.
 */
export function findAllergyConflicts(
  candidates: ResolvedFoodAllergens[],
  activeAllergenIds: string[],
): string[] {
  const blocked = new Set(activeAllergenIds.filter(Boolean));
  if (blocked.size === 0) return [];

  const conflicts: string[] = [];
  for (const candidate of candidates) {
    if (candidate.allergenDataStatus === "unknown") {
      conflicts.push(`${candidate.foodName} (allergen data unresolved)`);
      continue;
    }

    if (candidate.allergenIds.some((allergenId) => blocked.has(allergenId))) {
      conflicts.push(candidate.foodName);
    }
  }
  return conflicts;
}

export function assertNoAllergyConflict(
  candidates: ResolvedFoodAllergens[],
  activeAllergenIds: string[],
): void {
  const conflicts = findAllergyConflicts(candidates, activeAllergenIds);
  if (conflicts.length > 0) {
    throw new Error(`Allergy conflict detected: ${conflicts.join(", ")}`);
  }
}

/**
 * Explicit avoid rules and dietary rules are recommendation hard-blocks.
 * Unresolved exclusions fail closed instead of silently disappearing from context.
 */
export function findDietaryExclusionConflicts(
  candidates: ResolvedFoodDietarySafety[],
  exclusions: DietarySafetyExclusion[],
): string[] {
  if (exclusions.length === 0) return [];

  const conflicts = new Set<string>();
  const foodIds = new Set<string>();
  const ruleIds = new Set<string>();

  for (const exclusion of exclusions) {
    if (exclusion.resolutionStatus !== "resolved" || !exclusion.id) {
      conflicts.add(`${exclusion.label} (dietary exclusion unresolved)`);
      continue;
    }
    if (exclusion.kind === "food") foodIds.add(exclusion.id);
    else ruleIds.add(exclusion.id);
  }

  for (const candidate of candidates) {
    if (foodIds.has(candidate.foodId)) conflicts.add(candidate.foodName);

    if (ruleIds.size > 0) {
      if (candidate.dietarySafetyDataStatus === "unknown") {
        conflicts.add(`${candidate.foodName} (dietary safety data unresolved)`);
        continue;
      }
      if (candidate.dietaryConflictRuleIds.some((ruleId) => ruleIds.has(ruleId))) {
        conflicts.add(candidate.foodName);
      }
    }
  }

  return [...conflicts];
}

export function assertNoDietaryExclusionConflict(
  candidates: ResolvedFoodDietarySafety[],
  exclusions: DietarySafetyExclusion[],
): void {
  const conflicts = findDietaryExclusionConflicts(candidates, exclusions);
  if (conflicts.length > 0) {
    throw new Error(`Dietary safety conflict detected: ${conflicts.join(", ")}`);
  }
}
