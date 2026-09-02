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
    // Turkish proper-name case suffixes are often written with an apostrophe.
    // Join them before tokenization so "Aspirin'i bırak" becomes "aspirini birak".
    .replace(/['’ʼ]/g, "")
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
 * Defense-in-depth vocabulary for direct diagnosis assertions. ARVEN is a
 * nutrition product, so named medical conditions and diagnostic language are
 * not valid AI-authored conclusions. Keeping the predicate tied to medical
 * context avoids false positives such as "Sen kararlısın" or "Bu dengelidir".
 */
const DIAGNOSIS_TERM = "(?:diyabet|prediyabet|colyak|hipertansiyon|hipotansiyon|obezite|anemi|hipotiroidi|hipertiroidi|tiroid|insulin direnci|metabolik sendrom|alerji|intolerans|hastalik|sendrom)";
const DIRECT_DIAGNOSIS_PATTERNS = [
  /\b(?:tani|teshis)\w*\b/,
  new RegExp(`\\b(?:sende|sizde)\\b.{0,60}\\b${DIAGNOSIS_TERM}\\b.{0,30}\\b(?:var|oldugun|oldugunu)\\b`),
  new RegExp(`\\b${DIAGNOSIS_TERM}(?:in|un|nin|nun)?\\s+var\\b`),
  new RegExp(`\\b${DIAGNOSIS_TERM}\\s+hastasi(?:sin|siniz|dir)?\\b`),
  new RegExp(`\\b(?:sen|siz)\\s+${DIAGNOSIS_TERM}(?:sin|siniz|sun|sunuz)?\\b`),
  new RegExp(`\\bbu\\s+${DIAGNOSIS_TERM}(?:tir|dir|tur|dur)?\\b`),
  new RegExp(`\\b(?:belirti|belirtiler|bulgu|bulgular|sonuc|sonuclar|deger|degerler)\\w*\\b.{0,100}\\b${DIAGNOSIS_TERM}\\b.{0,50}\\b(?:oldugunu|gosteriyor|kanitliyor|dogruluyor)\\b`),
];

/**
 * ARVEN does not store or track medications. AI-authored health text therefore
 * cannot rely on a user medication registry for safety. Instead this boundary
 * rejects medication/treatment-management language and diagnosis assertions
 * directly. Safe escalation copy should be deterministic/server-authored.
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
  const blocked = new Set(activeAllergenIds.map((id) => id.trim()).filter(Boolean));
  if (blocked.size === 0) return [];

  const conflicts: string[] = [];
  for (const candidate of candidates) {
    if (candidate.allergenDataStatus === "unknown") {
      conflicts.push(`${candidate.foodName} (allergen data unresolved)`);
      continue;
    }

    if (candidate.allergenIds.some((allergenId) => blocked.has(allergenId.trim()))) {
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
 * Unresolved or malformed exclusions fail closed instead of disappearing.
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
    const resolvedId = exclusion.id?.trim() ?? "";
    if (exclusion.resolutionStatus !== "resolved" || resolvedId.length === 0) {
      conflicts.add(`${exclusion.label} (dietary exclusion unresolved)`);
      continue;
    }
    if (exclusion.kind === "food") foodIds.add(resolvedId);
    else ruleIds.add(resolvedId);
  }

  for (const candidate of candidates) {
    if (foodIds.has(candidate.foodId.trim())) conflicts.add(candidate.foodName);

    if (ruleIds.size > 0) {
      if (candidate.dietarySafetyDataStatus === "unknown") {
        conflicts.add(`${candidate.foodName} (dietary safety data unresolved)`);
        continue;
      }
      if (candidate.dietaryConflictRuleIds.some((ruleId) => ruleIds.has(ruleId.trim()))) {
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
