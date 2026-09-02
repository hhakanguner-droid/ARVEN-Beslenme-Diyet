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
    .replace(/['’ʼ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

const MEDICAL_MANAGEMENT_CONTEXT = ["ilac", "ilaclar", "ilac kullanimi", "medikasyon", "recete", "doz", "tedavi"];

/**
 * Explicit nutrition context prevents ordinary coaching such as "Tuzu azalt"
 * from being mistaken for treatment management. Outside this bounded nutrition
 * vocabulary, direct start/stop/increase/decrease/use directives fail closed;
 * ARVEN is not a medication-management product and does not keep a drug registry.
 */
const NUTRITION_CONTEXT_TERMS = [
  "besin", "gida", "yemek", "ogun", "porsiyon", "meyve", "sebze", "ekmek", "tuz", "seker",
  "zeytinyagi", "yag", "protein", "karbonhidrat", "lif", "su", "kalori", "kahvalti", "corba",
  "salata", "et", "tavuk", "balik", "yumurta", "sut", "yogurt", "peynir", "bakliyat", "kuruyemis",
];

const TREATMENT_ACTION_PATTERNS = [
  /\b(?:al|alma|kullan|kullanma|birak|kes|durdur|basla|atla|degistir|degistirme)\b/,
  /\b(?:al|kullan|birak|kes|durdur|basla|atla|degistir)(?:ma|me)?(?:mali|meli)(?:sin|siniz)?\b/,
  /\b(?:al|kullan|birak|kes|durdur|basla|atla|degistir)(?:abil|ebil)(?:ir)?(?:sin|siniz)?\b/,
  /\b(?:al|kullan|birak|kes|durdur|basla|atla|degistir)(?:man|men|maniz|meniz)\s+(?:gerekir|gerekiyor|lazim)\b/,
  /\b(?:artir|azalt|yukselt|dusur|surdur|devam)\b/,
];

const DIAGNOSIS_TERM = "(?:diyabet|prediyabet|colyak|hipertansiyon|hipotansiyon|obezite|anemi|hipotiroidi|hipertiroidi|tiroid|insulin direnci|metabolik sendrom|alerji|intolerans|hastalik|sendrom)";
const DIRECT_DIAGNOSIS_PATTERNS = [
  /\b(?:tani|teshis)\w*\b/,
  new RegExp(`\\b(?:sende|sizde)\\b.{0,60}\\b${DIAGNOSIS_TERM}\\b.{0,30}\\b(?:var|oldugun|oldugunu)\\b`),
  new RegExp(`\\b${DIAGNOSIS_TERM}(?:in|un|nin|nun)?\\s+var\\b`),
  new RegExp(`\\b${DIAGNOSIS_TERM}\\s+hastasi(?:sin|siniz|dir)?\\b`),
  new RegExp(`\\b(?:sen|siz)\\s+${DIAGNOSIS_TERM}(?:sin|siniz|sun|sunuz)?\\b`),
  // Condition-specific suffix form: "Diyabetsin", "Çölyaksın". Keeping the
  // condition vocabulary explicit avoids generic false positives like "kararlısın".
  new RegExp(`\\b${DIAGNOSIS_TERM}(?:sin|siniz|sun|sunuz)\\b`),
  new RegExp(`\\bbu\\s+${DIAGNOSIS_TERM}(?:tir|dir|tur|dur)?\\b`),
  new RegExp(`\\b(?:belirti|belirtiler|bulgu|bulgular|sonuc|sonuclar|deger|degerler)\\w*\\b.{0,100}\\b${DIAGNOSIS_TERM}\\b.{0,50}\\b(?:oldugunu|gosteriyor|kanitliyor|dogruluyor)\\b`),
];

export function assertNoMedicalOverreach(text: string): void {
  const normalized = normalizeTurkishText(text);
  const managementContext = MEDICAL_MANAGEMENT_CONTEXT.some((term) => normalized.includes(term));
  const nutritionContext = NUTRITION_CONTEXT_TERMS.some((term) => new RegExp(`\\b${term}\\w*\\b`).test(normalized));
  const treatmentAction = TREATMENT_ACTION_PATTERNS.some((pattern) => pattern.test(normalized));
  const treatmentDirective = treatmentAction && !nutritionContext;
  const diagnosisAssertion = DIRECT_DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(normalized));

  if (managementContext || treatmentDirective || diagnosisAssertion) {
    throw new Error("AI output violates ARVEN non-diagnostic health policy");
  }
}

export function findAllergyConflicts(candidates: ResolvedFoodAllergens[], activeAllergenIds: string[]): string[] {
  if (activeAllergenIds.length === 0) return [];
  const normalizedActiveIds = activeAllergenIds.map((id) => id.trim());
  if (normalizedActiveIds.some((id) => id.length === 0)) return ["Active allergen identifier unresolved"];
  const blocked = new Set(normalizedActiveIds);
  const conflicts: string[] = [];
  for (const candidate of candidates) {
    // With an active allergy, only verified candidate evidence is sufficient.
    // "not-applicable" is not trusted unless a future typed food class proves it.
    if (candidate.allergenDataStatus !== "verified") {
      conflicts.push(`${candidate.foodName} (allergen data unresolved)`);
      continue;
    }
    if (candidate.allergenIds.some((id) => id.trim().length === 0)) {
      conflicts.push(`${candidate.foodName} (allergen identifier unresolved)`);
      continue;
    }
    if (candidate.allergenIds.some((id) => blocked.has(id.trim()))) conflicts.push(candidate.foodName);
  }
  return conflicts;
}

export function assertNoAllergyConflict(candidates: ResolvedFoodAllergens[], activeAllergenIds: string[]): void {
  const conflicts = findAllergyConflicts(candidates, activeAllergenIds);
  if (conflicts.length > 0) throw new Error(`Allergy conflict detected: ${conflicts.join(", ")}`);
}

export function findDietaryExclusionConflicts(candidates: ResolvedFoodDietarySafety[], exclusions: DietarySafetyExclusion[]): string[] {
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
    if (exclusion.kind === "food") foodIds.add(resolvedId); else ruleIds.add(resolvedId);
  }
  for (const candidate of candidates) {
    const candidateFoodId = candidate.foodId.trim();
    if (foodIds.size > 0 && candidateFoodId.length === 0) {
      conflicts.add(`${candidate.foodName} (food identifier unresolved)`);
      continue;
    }
    if (foodIds.has(candidateFoodId)) conflicts.add(candidate.foodName);
    if (ruleIds.size > 0) {
      // Active dietary rules require verified conflict evidence. Unrestricted
      // "not-applicable" is intentionally fail-closed in V1.
      if (candidate.dietarySafetyDataStatus !== "verified") {
        conflicts.add(`${candidate.foodName} (dietary safety data unresolved)`);
        continue;
      }
      const ids = candidate.dietaryConflictRuleIds.map((id) => id.trim());
      if (ids.some((id) => id.length === 0)) {
        conflicts.add(`${candidate.foodName} (dietary rule identifier unresolved)`);
        continue;
      }
      if (ids.some((id) => ruleIds.has(id))) conflicts.add(candidate.foodName);
    }
  }
  return [...conflicts];
}

export function assertNoDietaryExclusionConflict(candidates: ResolvedFoodDietarySafety[], exclusions: DietarySafetyExclusion[]): void {
  const conflicts = findDietaryExclusionConflicts(candidates, exclusions);
  if (conflicts.length > 0) throw new Error(`Dietary safety conflict detected: ${conflicts.join(", ")}`);
}
