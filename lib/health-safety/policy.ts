export type ResolvedFoodAllergens = {
  foodId: string;
  foodName: string;
  allergenDataStatus: "verified" | "unknown" | "not-applicable";
  allergenIds: string[];
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
const MEDICATION_CHANGE_ACTIONS = [
  "birak",
  "kes",
  "durdur",
  "basla",
  "artir",
  "azalt",
  "degistir",
  "yukselt",
  "dusur",
];

const DIRECT_MEDICAL_PATTERNS = [
  /\btani\s+koy/,
  /\btedavi\w*\s+(basla|uygula|degistir|durdur)/,
  /\brecete\b/,
];

export function assertNoMedicalOverreach(text: string): void {
  const normalized = normalizeTurkishText(text);
  const medicationContext = MEDICATION_CONTEXT.some((term) => normalized.includes(term));
  const medicationChange = MEDICATION_CHANGE_ACTIONS.some((term) => normalized.includes(term));
  const directOverreach = DIRECT_MEDICAL_PATTERNS.some((pattern) => pattern.test(normalized));

  if ((medicationContext && medicationChange) || directOverreach) {
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
