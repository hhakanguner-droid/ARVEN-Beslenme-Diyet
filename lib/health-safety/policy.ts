export type ResolvedFoodAllergens = {
  foodId: string;
  foodName: string;
  allergenDataStatus: "verified" | "unknown" | "not-applicable";
  allergenIds: string[];
};

export type AllergenSafetyExclusion = {
  id: string | null;
  label: string;
  resolutionStatus: "resolved" | "unresolved";
};

export type DietarySafetyExclusion = {
  kind: "food" | "rule";
  id: string | null;
  label: string;
  resolutionStatus: "resolved" | "unresolved";
};

export type ResolvedFoodDietarySafety = {
  foodId: string;
  foodName: string;
  dietarySafetyDataStatus: "verified" | "unknown" | "not-applicable";
  dietaryConflictRuleIds: string[];
};

function normalizeTurkishText(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/ş/g, "s")
    .replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/['’ʼ]/g, "").replace(/[^a-z0-9\s,;.!?]/g, " ").replace(/\s+/g, " ");
}

const MEDICAL_MANAGEMENT_CONTEXT = [
  "ilac", "ilaclar", "ilac kullanimi", "medikasyon", "recete", "doz", "tedavi", "insulin", "antibiyotik", "antibiyoti", "warfarin", "metformin", "aspirin", "euthyrox",
  "medication", "medications", "medicine", "medicines", "prescription", "prescriptions", "dose", "dosage", "treatment", "antibiotic", "antibiotics",
];
const NUTRITION_TARGET = "(?:besin|gida|yemek|ogun|porsiyon|meyve|sebze|ekmek|ekmegi|tuz|tuzu|seker|sekeri|zeytinyagi|yag|yagi|protein|karbonhidrat|lif|kalori|kahvalti|corba|salata|et|tavuk|balik|yumurta|sut|yogurt|peynir|bakliyat|kuruyemis|su|suyu)";
const PREPARATION_CONTEXT = "(?:ocak|firin|tava|tencere|karisim|hamur|sos|pisir|kaynat|kavur|dinlen|beklet|servis|tabak|kap|kase|malzeme)";
const TREATMENT_ACTION = "(?:al|alma|alman|almani|almaniz|almanizi|kullan|kullanma|kullanman|kullanmani|kullanmaniz|kullanmanizi|birak|birakma|birakman|birakmani|birakmaniz|birakmanizi|kes|kesme|kesmen|kesmeni|kesmeniz|kesmenizi|durdur|durdurma|durdurman|durdurmani|durdurmaniz|durdurmanizi|basla|baslama|baslaman|baslamani|baslamaniz|baslamanizi|atla|atlama|atlaman|atlamani|atlamaniz|atlamanizi|degistir|degistirme|degistirmen|degistirmeni|degistirmeniz|degistirmenizi|artir|artirma|artirman|artirmani|artirmaniz|artirmanizi|azalt|azaltma|azaltman|azaltmani|azaltmaniz|azaltmanizi|yukselt|dusur|surdur|devam|almali(?:sin|siniz)?|kullanmali(?:sin|siniz)?|birakmali(?:sin|siniz)?|kesmeli(?:sin|siniz)?|durdurmali(?:sin|siniz)?|baslamali(?:sin|siniz)?|atlamali(?:sin|siniz)?|degistirmeli(?:sin|siniz)?)";
const TREATMENT_ACTION_GLOBAL = new RegExp(String.raw`\b${TREATMENT_ACTION}\b`, "g");
const NUTRITION_TARGET_TOKEN = new RegExp(`^${NUTRITION_TARGET}(?:yi|i|u|yu|e|a|den|dan)?$`);
const PREPARATION_CONTEXT_TOKEN = new RegExp(String.raw`^${PREPARATION_CONTEXT}\w*$`);

const DIAGNOSIS_TERM = "(?:diyabet|prediyabet|colyak|hipertansiyon|hipotansiyon|obezite|anemi|hipotiroidi|hipertiroidi|tiroid|insulin direnci|metabolik sendrom|alerji|intolerans|hastalik|sendrom)";
const MEDICAL_LEXEME = "(?:kanser|depresyon|anksiyete|astim|migren|epilepsi|bipolar|psikoz|siroz|hepatit|artrit|dermatit|fibroz|skleroz|nefrit|gastrit|kolit|pnomoni|tromboz|losemi|lenfoma|melanom|karsinom|sarkom|parkinson|endometriozis)";
const MEDICAL_ASSERTION_TERM = `(?:${DIAGNOSIS_TERM}|${MEDICAL_LEXEME})`;
const INFLECTED_MEDICAL_ASSERTION_TERM = `${MEDICAL_ASSERTION_TERM}(?:e|a|i|u|yi|yu|ni|nu|in|un|nin|nun)?`;
const ENGLISH_DIAGNOSIS_TERM = "(?:diabetes|diabetic|prediabetes|prediabetic|celiac(?: disease)?|hypertension|hypotension|obesity|anemia|hypothyroidism|hyperthyroidism|thyroid disease|insulin resistance|metabolic syndrome|allergy|intolerance|cancer|depression|anxiety|asthma|migraine|epilepsy|bipolar disorder|psychosis|cirrhosis|hepatitis|arthritis|dermatitis|fibrosis|sclerosis|nephritis|gastritis|colitis|pneumonia|thrombosis|leukemia|lymphoma|melanoma|carcinoma|sarcoma|parkinsons disease|endometriosis)";
const SAFE_ENGLISH_PREDICATE = /^(?:an?\s+)?(?:(?:very|quite|more|less|well|good|great|solid|clear|simple|balanced|healthy|helpful|realistic|practical|flexible)\s+)*(?:meal|meal plan|plan|goal|option|choice|recipe|ingredient|portion|breakfast|lunch|dinner|snack|routine|schedule|strategy|approach|idea|habit|preference|target)\b/;
const GENERIC_ENGLISH_DIAGNOSIS_GRAMMARS = [
  /\b(?:you|they|he|she)\s+(?:(?:probably|possibly|likely)\s+)?(?:(?:may|might|could)\s+)?(?:have|has)\s+(.+)/,
  /\b(?:you|they|he|she)\s+(?:seem|seems|appear|appears|look|looks)\s+(?:to\s+be\s+)?(.+)/,
  /\b(?:this|that|it)\s+(?:(?:probably|possibly|likely)\s+)?(?:(?:may|might|could|can)\s+)?(?:is|be)\s+(.+)/,
  /\b(?:this|that|it)\s+(?:looks|seems|appears|sounds)\s+like\s+(.+)/,
  /\b(?:looks|seems|appears|sounds)\s+like\s+(.+)/,
];
const DIRECT_DIAGNOSIS_PATTERNS = [
  /\b(?:tani|tanisi|taninin|taniya|tanidan|teshis|teshisi|teshisin|teshise|teshisten)\b/,
  new RegExp(String.raw`\b(?:sende|sizde)\b.{0,60}\b${MEDICAL_ASSERTION_TERM}\b.{0,30}\b(?:var|oldugun|oldugunu)\b`),
  new RegExp(String.raw`\b${MEDICAL_ASSERTION_TERM}(?:in|un|nin|nun)?\s+var\b`),
  new RegExp(String.raw`\b${MEDICAL_ASSERTION_TERM}\s+hastasi(?:sin|siniz|dir)?\b`),
  new RegExp(String.raw`\b(?:sen|siz)\s+${MEDICAL_ASSERTION_TERM}(?:sin|siniz|sun|sunuz)?\b`),
  new RegExp(String.raw`\b${DIAGNOSIS_TERM}(?:sin|siniz|sun|sunuz)\b`),
  new RegExp(String.raw`\bbu\s+${MEDICAL_ASSERTION_TERM}(?:tir|dir|tur|dur)?\b`),
  new RegExp(String.raw`\b(?:belirti|belirtiler|bulgu|bulgular|sonuc|sonuclar|deger|degerler|durum)\w*\b.{0,100}\b${INFLECTED_MEDICAL_ASSERTION_TERM}\b.{0,50}\b(?:oldugunu|gosteriyor|kanitliyor|dogruluyor|isaret\s+ediyor|dusunduruyor|akla\s+getiriyor)\b`),
  new RegExp(String.raw`\b${MEDICAL_LEXEME}(?:li|lu|da|de|i)?(?:sin|siniz|sun|sunuz|in)\b`),
  new RegExp(String.raw`\b(?:you have|youve got|you are|youre)\s+(?:an?\s+)?${ENGLISH_DIAGNOSIS_TERM}\b`),
  new RegExp(String.raw`\b(?:your|these|this)\s+(?:symptoms?|results?|findings?|condition)\b.{0,100}\b(?:indicate|indicates|suggest|suggests|confirm|confirms|show|shows|mean|means)\b.{0,50}\b${ENGLISH_DIAGNOSIS_TERM}\b`),
  /\b(?:diagnosis|diagnosed|diagnostic)\b/,
];

function splitDirectiveClauses(normalized: string): string[] {
  return normalized
    .split(/(?:[;,!.?]+|\s+ve\s+|\s+ama\s+|\s+fakat\s+|\s+ancak\s+)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function nearestTokenBefore(value: string): string | null {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  return tokens.at(-1) ?? null;
}
function nearestTokenAfter(value: string): string | null {
  return value.trim().split(/\s+/).filter(Boolean)[0] ?? null;
}

function actionOccurrenceTargetsNutrition(clause: string, actionIndex: number, actionLength: number): boolean {
  const before = clause.slice(0, actionIndex);
  const after = clause.slice(actionIndex + actionLength);
  const previous = nearestTokenBefore(before);
  if (previous && NUTRITION_TARGET_TOKEN.test(previous)) return true;
  const next = nearestTokenAfter(after);
  return next !== null && NUTRITION_TARGET_TOKEN.test(next);
}

function actionOccurrenceIsPreparation(clause: string, actionIndex: number, actionLength: number): boolean {
  const before = clause.slice(0, actionIndex);
  const after = clause.slice(actionIndex + actionLength);
  const nearby = [...before.trim().split(/\s+/).slice(-3), ...after.trim().split(/\s+/).slice(0, 3)].filter(Boolean);
  return nearby.some((token) => PREPARATION_CONTEXT_TOKEN.test(token));
}

function clauseContainsUnsafeTreatmentDirective(clause: string): boolean {
  const hasMedicalContext = MEDICAL_MANAGEMENT_CONTEXT.some((term) => clause.includes(term));
  TREATMENT_ACTION_GLOBAL.lastIndex = 0;
  for (const match of clause.matchAll(TREATMENT_ACTION_GLOBAL)) {
    const index = match.index ?? 0;
    if (actionOccurrenceTargetsNutrition(clause, index, match[0].length)) continue;
    if (!hasMedicalContext && actionOccurrenceIsPreparation(clause, index, match[0].length)) continue;
    if (hasMedicalContext || /\b(?:gerekiyor|gerekli|onerilir|oneriyorum|tavsiye|her gun|sabah|aksam)\b/.test(clause)) return true;
  }
  return false;
}

function clauseContainsUnsafeEnglishDiagnosis(clause: string): boolean {
  for (const grammar of GENERIC_ENGLISH_DIAGNOSIS_GRAMMARS) {
    const match = grammar.exec(clause);
    if (!match) continue;
    const predicate = (match[1] ?? "").trim();
    if (!predicate || SAFE_ENGLISH_PREDICATE.test(predicate)) continue;
    return true;
  }
  return false;
}

export function assertNoMedicalOverreach(text: string): void {
  const normalized = normalizeTurkishText(text);
  const clauses = splitDirectiveClauses(normalized);
  const managementContext = MEDICAL_MANAGEMENT_CONTEXT.some((term) => normalized.includes(term));
  const treatmentDirective = clauses.some(clauseContainsUnsafeTreatmentDirective);
  const diagnosisAssertion = DIRECT_DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(normalized)) || clauses.some(clauseContainsUnsafeEnglishDiagnosis);
  if (managementContext || treatmentDirective || diagnosisAssertion) {
    throw new Error("AI output violates ARVEN non-diagnostic health policy");
  }
}

function normalizeAllergenExclusions(active: Array<string | AllergenSafetyExclusion>): AllergenSafetyExclusion[] {
  return active.map((entry) => typeof entry === "string"
    ? { id: entry, label: entry, resolutionStatus: entry.trim() ? "resolved" : "unresolved" }
    : entry);
}

export function findAllergyConflicts(candidates: ResolvedFoodAllergens[], activeAllergens: Array<string | AllergenSafetyExclusion>): string[] {
  if (activeAllergens.length === 0) return [];
  const conflicts = new Set<string>();
  const blocked = new Set<string>();
  for (const exclusion of normalizeAllergenExclusions(activeAllergens)) {
    const id = exclusion.id?.trim() ?? "";
    if (exclusion.resolutionStatus !== "resolved" || id.length === 0) {
      conflicts.add(`${exclusion.label} (active allergen unresolved)`);
      continue;
    }
    blocked.add(id);
  }
  for (const candidate of candidates) {
    if (candidate.allergenDataStatus !== "verified") {
      conflicts.add(`${candidate.foodName} (allergen data unresolved)`);
      continue;
    }
    const ids = candidate.allergenIds.map((id) => id.trim());
    if (ids.some((id) => id.length === 0)) {
      conflicts.add(`${candidate.foodName} (allergen identifier unresolved)`);
      continue;
    }
    if (ids.some((id) => blocked.has(id))) conflicts.add(candidate.foodName);
  }
  return [...conflicts];
}

export function assertNoAllergyConflict(candidates: ResolvedFoodAllergens[], activeAllergens: Array<string | AllergenSafetyExclusion>): void {
  const conflicts = findAllergyConflicts(candidates, activeAllergens);
  if (conflicts.length > 0) throw new Error(`Allergy conflict detected: ${conflicts.join(", ")}`);
}

export function findDietaryExclusionConflicts(candidates: ResolvedFoodDietarySafety[], exclusions: DietarySafetyExclusion[]): string[] {
  if (exclusions.length === 0) return [];
  const conflicts = new Set<string>();
  const foodIds = new Set<string>();
  const ruleIds = new Set<string>();
  for (const exclusion of exclusions) {
    const id = exclusion.id?.trim() ?? "";
    if (exclusion.resolutionStatus !== "resolved" || id.length === 0) {
      conflicts.add(`${exclusion.label} (dietary exclusion unresolved)`);
      continue;
    }
    if (exclusion.kind === "food") foodIds.add(id); else ruleIds.add(id);
  }
  for (const candidate of candidates) {
    const foodId = candidate.foodId.trim();
    if (foodIds.size > 0 && foodId.length === 0) {
      conflicts.add(`${candidate.foodName} (food identifier unresolved)`);
      continue;
    }
    if (foodIds.has(foodId)) conflicts.add(candidate.foodName);
    if (ruleIds.size > 0) {
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