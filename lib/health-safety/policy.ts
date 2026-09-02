export type ResolvedFoodAllergens = {
  foodId: string;
  foodName: string;
  allergenDataStatus: "verified" | "unknown" | "not-applicable";
  allergenIds: string[];
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

const MEDICAL_MANAGEMENT_CONTEXT = [
  "ilac",
  "ilaclar",
  "ilac kullanimi",
  "medikasyon",
  "recete",
  "doz",
  "tedavi",
];

/**
 * The health boundary intentionally rejects obligation/permission wording around
 * treatment-style action verbs without trying to identify a drug name. ARVEN V1
 * stores no medication registry, so a registry-independent fail-closed rule is
 * safer than guessing whether the preceding noun is a medicine.
 */
const TREATMENT_MODAL_PATTERNS = [
  /\b(?:al|kullan|birak|kes|durdur|basla|atla|degistir)(?:ma|me)?(?:mali|meli)(?:sin|siniz)?\b/,
  /\b(?:al|kullan|birak|kes|durdur|basla|atla|degistir)(?:abil|ebil)(?:ir)?(?:sin|siniz)?\b/,
  /\b(?:al|kullan|birak|kes|durdur|basla|atla|degistir)(?:man|men|maniz|meniz)\s+(?:gerekir|gerekiyor|lazim)\b/,
];

const DIRECT_TREATMENT_PATTERNS = [
  /\b[a-z0-9]{3,}\w*\s+(?:artik\s+)?(?:al|alma|kullan|kullanma|birak|kes|durdur|basla|atla|degistir|degistirme)\b/,
  /\b[a-z0-9]{3,}\w*\s+(?:doz\w*|kullanim\w*)\s+(?:artir|azalt|degistir|yukselt|dusur|atla|surdur|devam)\b/,
  /\btedavi\w*\s+(?:basla|uygula|degistir|durdur|surdur)\b/,
  /\brecete\w*\b/,
  ...TREATMENT_MODAL_PATTERNS,
];

/**
 * Health AI must not label the user with a diagnosis. These patterns are
 * intentionally broader than a disease-name allowlist: direct second-person
 * predicate labels and definitive "bu X'tir" assertions are rejected so a new
 * disease term cannot silently bypass the boundary.
 */
const DIRECT_DIAGNOSIS_PATTERNS = [
  /\b(?:tani|teshis)\w*\b/,
  /\b(?:sende|sizde)\b.{0,80}\b(?:var|hastasin|hastaligi|oldugun|oldugunu)\b/,
  /\b(?:belirti|belirtiler|bulgu|bulgular|sonuc|sonuclar|deger|degerler)\w*\b.{0,100}\b(?:oldugunu|gosteriyor|kanitliyor|dogruluyor)\b/,
  /\b[a-z0-9]{3,}(?:\s+[a-z0-9]{3,}){0,2}\s+hastasi(?:sin|siniz|dir)?\b/,
  /\b(?:sen|siz)\s+(?:[a-z0-9]{2,}\s+){0,2}[a-z0-9]{3,}(?:sin|siniz|sun|sunuz)\b/,
  /\bbu\s+[a-z0-9]{3,}(?:tir|dir|tur|dur)\b/,
];

/**
 * ARVEN does not store or track medications. AI-authored health text therefore
 * cannot rely on a user medication registry for safety. Instead this boundary
 * rejects medication/treatment-management language and diagnosis assertions
 * directly. Safe escalation copy (for example, advising professional review)
 * should be deterministic/server-authored when needed.
 */
export function assertNoMedicalOverreach(text: string): void {
  const normalized = normalizeTurkishText(text);
  const managementContext = MEDICAL_MANAGEMENT_CONTEXT.some((term) => normalized.includes(term));
  const treatmentDirective = DIRECT_TREATMENT_PATTERNS.some((pattern) => pattern.test(normalized));
  const diagnosisAssertion = DIRECT_DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(normalized));

  if (managementContext || treatmentDirective || diagnosisAssertion) {
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
