import { z } from "zod";
import { assertNoMedicalOverreach } from "@/lib/health-safety/policy";

const PortionMeasure = z.enum([
  "piece", "slice", "teaspoon", "tablespoon", "tea-glass", "water-glass", "cup", "bowl",
  "handful", "palm", "serving", "package", "bottle", "can", "ladle",
]);
const PortionSize = z.enum(["small", "medium", "large"]);
const ANY_DIGIT = /\p{N}/u;
const NUMBER_WORDS = new Set([
  "sifir", "iki", "uc", "dort", "bes", "alti", "yedi", "sekiz", "dokuz", "on", "yirmi", "otuz",
  "kirk", "elli", "altmis", "yetmis", "seksen", "doksan", "yuz", "bin", "milyon", "milyar", "trilyon",
  "yarim", "bucuk", "ceyrek", "yuzde", "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred",
  "thousand", "million", "billion", "half", "quarter", "percent", "once", "twice", "thrice",
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth",
  "twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth",
  "hundredth", "thousandth", "millionth", "billionth",
  "dozen", "dozens", "score", "scores", "pair", "pairs", "couple", "both", "single", "double", "triple", "quadruple", "gross",
]);
const TURKISH_NUMBER_SUFFIXES = new Set([
  "i", "u", "a", "e", "si", "su", "in", "un", "nin", "nun", "ini", "unu", "sini", "sunu", "ina", "ine",
  "una", "une", "sina", "sine", "suna", "sune", "dan", "den", "tan", "ten", "da", "de", "ta", "te", "ya",
  "ye", "lar", "ler", "lari", "leri", "larin", "lerin", "lara", "lere", "lik", "luk", "inci", "uncu",
]);
const NUTRITION_UNIT_PATTERN = "(?:kcal|kilokalori[a-z]*|kilocalorie[a-z]*|calorie[a-z]*|calories|kj|kilojul[a-z]*|kilojoule[a-z]*|kalori[a-z]*|gram[a-z]*|miligram[a-z]*|mikrogram[a-z]*|mililitre[a-z]*|millilitre[a-z]*|litre[a-z]*|milligram[a-z]*|microgram[a-z]*|milliliter[a-z]*|liter[a-z]*|gr|g|mg|mcg|ml|kg|l)";
const NUTRITION_METRIC_PATTERN = "(?:kalori|kcal|enerji|protein|karbonhidrat|karb|yag|lif|fiber|sodyum|tuz|seker|kilo|kilogram|agirlik|hedef[a-z]*|uyum[a-z]*|plan|trend|calorie|calories|energy|carb|carbs|fat|sodium|sugar|weight|goal|target|adherence|trend)";
const MEASURE_LABELS: Record<z.infer<typeof PortionMeasure>, string> = {
  piece: "adet", slice: "dilim", teaspoon: "çay kaşığı", tablespoon: "yemek kaşığı", "tea-glass": "çay bardağı",
  "water-glass": "su bardağı", cup: "fincan", bowl: "kase", handful: "avuç", palm: "avuç içi", serving: "porsiyon",
  package: "paket", bottle: "şişe", can: "kutu", ladle: "kepçe",
};
const SIZE_LABELS: Record<z.infer<typeof PortionSize>, string> = { small: "küçük", medium: "orta", large: "büyük" };

function normalizeNumberText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c")
    .replace(/ö/g, "o").replace(/ü/g, "u").replace(/[^a-z0-9\p{N}\s.,+\-]/gu, " ").replace(/\s+/g, " ");
}
function isWrittenNumberToken(token: string): boolean {
  if (NUMBER_WORDS.has(token)) return true;
  if (token.endsWith("fold") && NUMBER_WORDS.has(token.slice(0, -4))) return true;
  for (const base of NUMBER_WORDS) {
    if (!token.startsWith(base) || token.length <= base.length) continue;
    if (TURKISH_NUMBER_SUFFIXES.has(token.slice(base.length))) return true;
  }
  return false;
}
function containsSpelledNumberWord(value: string): boolean {
  return normalizeNumberText(value).split(/[^a-z0-9]+/).filter(Boolean).some(isWrittenNumberToken);
}
function containsContextualOneClaim(value: string): boolean {
  const normalized = normalizeNumberText(value);
  const unitOrMetric = `${NUTRITION_UNIT_PATTERN}|${NUTRITION_METRIC_PATTERN}|puan|adim|saat|gun|hafta|ogun|porsiyon|kilo|kilogram`;
  const directOne = new RegExp(`\\b(?:yuzde\\s+bir|percent\\s+one|bir\\s+(?:${unitOrMetric})|one\\s+(?:${unitOrMetric})|(?:${unitOrMetric})\\s*:?\\s*(?:bir|one))\\b`, "i");
  const frequencyOne = /\bbir(?:er)?\s+(?:kez|defa|kere)(?:den|dan|ten|tan|de|da|ye|ya)?\b/i;
  return directOne.test(normalized) || frequencyOne.test(normalized);
}
function containsDigitNutritionClaim(value: string): boolean {
  if (!ANY_DIGIT.test(value)) return false;
  const normalized = normalizeNumberText(value);
  return new RegExp(`\\b(?:${NUTRITION_UNIT_PATTERN}|${NUTRITION_METRIC_PATTERN})\\b`, "i").test(normalized);
}
function containsSpelledNutritionClaim(value: string): boolean {
  const normalized = normalizeNumberText(value);
  return new RegExp(`\\b(?:${NUTRITION_UNIT_PATTERN}|${NUTRITION_METRIC_PATTERN})\\b`, "i").test(normalized)
    && (containsSpelledNumberWord(normalized) || containsContextualOneClaim(normalized));
}
function containsWeeklyNumericClaim(value: string): boolean {
  return ANY_DIGIT.test(value) || containsSpelledNumberWord(value) || containsContextualOneClaim(value);
}
function assertSafeNarrative(value: string): boolean {
  try { assertNoMedicalOverreach(value); return true; }
  catch { return false; }
}
function mealNarrative(max: number) {
  return z.string().trim().min(1).max(max)
    .refine((value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
      "AI meal text must not contain numeric nutrition/weight/adherence claims")
    .refine(assertSafeNarrative, "AI output violates ARVEN non-diagnostic health policy");
}
function weeklyNarrative(max: number) {
  return z.string().trim().min(1).max(max)
    .refine((value) => !containsWeeklyNumericClaim(value),
      "Weekly narrative must not contain numeric claims; render deterministic metrics separately")
    .refine(assertSafeNarrative, "AI output violates ARVEN non-diagnostic health policy");
}
const NaturalPortionLabel = z.string().trim().min(1).max(120).refine(
  (value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
  "Natural portion labels must not smuggle gram/ml nutrition quantities",
);
const FoodQuery = z.string().trim().min(1).max(120)
  .refine(
    (value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
    "Food queries must not contain model-authored gram or nutrition quantities",
  )
  .refine(assertSafeNarrative, "Food query violates ARVEN medication/health safety boundary");
function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100).replace(".", ",");
}
function isRepresentablePortionQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0.01 && value <= 20 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}
function canonicalHintLabel(measure: z.infer<typeof PortionMeasure>, quantity: number, size?: z.infer<typeof PortionSize>): string {
  const sizeLabel = size ? `${SIZE_LABELS[size]} ` : "";
  return `${formatQuantity(quantity)} ${sizeLabel}${MEASURE_LABELS[measure]}`;
}
const PortionHint = z.object({
  measure: PortionMeasure,
  quantity: z.number().refine(isRepresentablePortionQuantity, "portion quantity must be between 0.01 and 20 in 0.01 increments"),
  size: PortionSize.optional(),
  naturalLabel: NaturalPortionLabel,
}).strict().superRefine((value, ctx) => {
  const expected = canonicalHintLabel(value.measure, value.quantity, value.size).toLocaleLowerCase("tr-TR");
  if (value.naturalLabel.trim().toLocaleLowerCase("tr-TR") !== expected) {
    ctx.addIssue({ code: "custom", path: ["naturalLabel"], message: `naturalLabel must match structured portion hint (${expected})` });
  }
});
const SuggestedIngredient = z.object({ foodQuery: FoodQuery, portionHint: PortionHint }).strict();
export const MealSuggestionV1 = z.object({
  schemaVersion: z.literal("MealSuggestionV1"), title: mealNarrative(120), rationale: mealNarrative(600),
  ingredients: z.array(SuggestedIngredient).min(1).max(20), preparation: z.array(mealNarrative(300)).max(12), uncertainty: z.array(mealNarrative(240)).max(8),
}).strict();
export type MealSuggestion = z.infer<typeof MealSuggestionV1>;
export const WeeklyInsightV1 = z.object({
  schemaVersion: z.literal("WeeklyInsightV1"), summary: weeklyNarrative(900), positives: z.array(weeklyNarrative(300)).max(6),
  areasForImprovement: z.array(weeklyNarrative(300)).max(6), suggestions: z.array(weeklyNarrative(300)).max(6), uncertainty: z.array(weeklyNarrative(240)).max(6),
}).strict();
export type WeeklyInsight = z.infer<typeof WeeklyInsightV1>;
export function parseMealSuggestion(input: unknown): MealSuggestion { return MealSuggestionV1.parse(input); }
export function parseWeeklyInsight(input: unknown): WeeklyInsight { return WeeklyInsightV1.parse(input); }

// Phase 4: ARVEN chat. chatNarrative mirrors mealNarrative's numeric-claim guard so free-form
// chat replies are held to the same "AI never states a number" rule as meal text.
function chatNarrative(max: number) {
  return z.string().trim().min(1).max(max)
    .refine((value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
      "AI chat text must not contain numeric nutrition/weight/adherence claims")
    .refine(assertSafeNarrative, "AI output violates ARVEN non-diagnostic health policy");
}
const MemoryFactProvenance = z.enum(["user-stated", "ai-inferred"]);
const MemoryFactConfidence = z.enum(["high", "medium", "low"]);
// Mirrors the shape of the persistence layer's MemoryFactInput (lib/persistence/v1-boundary.ts)
// but is defined independently here to keep this AI-output-facing contract module free of any
// dependency on the persistence module.
export const MemoryUpdateV1 = z.object({
  factText: z.string().trim().min(1).max(300)
    .refine((value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
      "Memory facts must not contain numeric nutrition/weight quantities")
    .refine(assertSafeNarrative, "Memory fact violates ARVEN non-diagnostic health policy"),
  provenance: MemoryFactProvenance,
  confidence: MemoryFactConfidence,
}).strict();
export type MemoryUpdate = z.infer<typeof MemoryUpdateV1>;
export const ProposedWaterActionV1 = z.object({
  kind: z.literal("water-log"),
  milliliters: z.number().int().min(1).max(5000),
}).strict();
export type ProposedWaterAction = z.infer<typeof ProposedWaterActionV1>;
export const ArvenChatReplyV1 = z.object({
  schemaVersion: z.literal("ArvenChatReplyV1"),
  reply: chatNarrative(2000),
  mealSuggestion: MealSuggestionV1.optional(),
  proposedWaterAction: ProposedWaterActionV1.optional(),
  memoryUpdates: z.array(MemoryUpdateV1).max(5).optional(),
  uncertainty: z.array(chatNarrative(240)).max(6),
}).strict();
export type ArvenChatReply = z.infer<typeof ArvenChatReplyV1>;
export function parseArvenChatReply(input: unknown): ArvenChatReply { return ArvenChatReplyV1.parse(input); }

// Phase 5: vision. A photo is never a source of numeric nutrition truth any more than free-form
// chat or a text meal suggestion is — every guard from mealNarrative/FoodQuery/PortionHint above
// applies unchanged; the only thing genuinely new here is a per-item/per-photo confidence label,
// since a photo estimate is inherently less certain than a food the user typed or scanned.
const PhotoConfidence = z.enum(["high", "medium", "low"]);
const PhotoEstimatedIngredient = z.object({
  foodQuery: FoodQuery,
  portionHint: PortionHint,
  confidence: PhotoConfidence,
}).strict();
export const MealPhotoEstimateV1 = z.object({
  schemaVersion: z.literal("MealPhotoEstimateV1"),
  items: z.array(PhotoEstimatedIngredient).min(1).max(15),
  overallConfidence: PhotoConfidence,
  uncertainty: z.array(mealNarrative(240)).max(8),
}).strict();
export type MealPhotoEstimate = z.infer<typeof MealPhotoEstimateV1>;
export function parseMealPhotoEstimate(input: unknown): MealPhotoEstimate { return MealPhotoEstimateV1.parse(input); }

// Menu ranking is an ordinal judgement call ("this one fits your goal better than that one"), not
// a numeric claim, so it is allowed to differ from "no numbers" the way a plain preference order
// would — `fitsGoal` is a three-way qualitative label, never a score, and `rationale` still goes
// through the same numeric-claim guard as every other narrative field.
const MenuItemFit = z.enum(["good-fit", "moderate-fit", "less-fit"]);
const RankedMenuItem = z.object({
  itemName: z.string().trim().min(1).max(160)
    .refine((value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
      "Menu item names must not contain AI-authored nutrition quantities")
    .refine(assertSafeNarrative, "Menu item name violates ARVEN non-diagnostic health policy"),
  rationale: mealNarrative(300),
  fitsGoal: MenuItemFit.optional(),
}).strict();
export const MenuAnalysisV1 = z.object({
  schemaVersion: z.literal("MenuAnalysisV1"),
  rankedItems: z.array(RankedMenuItem).min(1).max(30),
  uncertainty: z.array(mealNarrative(240)).max(8),
}).strict();
export type MenuAnalysis = z.infer<typeof MenuAnalysisV1>;
export function parseMenuAnalysis(input: unknown): MenuAnalysis { return MenuAnalysisV1.parse(input); }

// Barcode/photo-assisted product discovery: the model only ever proposes a *candidate* identity
// (a name/brand to search for, or a barcode to look up) — it never supplies nutrition figures
// itself. The existing verified catalog / Open Food Facts search (lib/nutrition/providers/
// open-food-facts.ts, already built in Phase 3) is what the client feeds this candidate into, and
// that lookup — not the model — is the only source of the actual numbers.
const CandidateBarcode = z.string().trim().regex(/^[0-9]{6,14}$/, "detectedBarcode must be 6 to 14 digits").nullable();
export const ProductPhotoIdentificationV1 = z.object({
  schemaVersion: z.literal("ProductPhotoIdentificationV1"),
  candidateProductName: FoodQuery.nullable(),
  candidateBrand: z.string().trim().min(1).max(120).nullable(),
  detectedBarcode: CandidateBarcode,
  confidence: PhotoConfidence,
  uncertainty: z.array(mealNarrative(240)).max(4),
}).strict();
export type ProductPhotoIdentification = z.infer<typeof ProductPhotoIdentificationV1>;
export function parseProductPhotoIdentification(input: unknown): ProductPhotoIdentification { return ProductPhotoIdentificationV1.parse(input); }

// Phase 6: lab result extraction. Unlike every contract above, a lab report's numbers ARE the
// ground truth the user is trying to capture from their own document — the numeric-claim guards
// used everywhere else exist only to stop the model inventing NUTRITION numbers, so they do not
// apply here. What still applies unchanged is the non-diagnostic health policy: the model
// transcribes marker/value/range text off the photo, it never asserts a diagnosis or gives
// treatment/medication direction about what it read (see assertNoMedicalOverreach in
// lib/health-safety/policy.ts). Every extracted row is 'extracted' (unreviewed) until the user
// confirms it, optionally after editing the transcription — see db/migrations/0006_phase6_health.sql.
const LabMarkerName = z.string().trim().min(1).max(160).refine(assertSafeNarrative, "Lab marker name violates ARVEN non-diagnostic health policy");
const LabResultText = z.string().trim().min(1).max(80);
const LabExtractedEntry = z.object({
  markerName: LabMarkerName,
  valueText: LabResultText,
  unitText: z.string().trim().min(1).max(40).nullable(),
  referenceRangeText: z.string().trim().min(1).max(80).nullable(),
}).strict();
function labNarrative(max: number) {
  return z.string().trim().min(1).max(max).refine(assertSafeNarrative, "AI output violates ARVEN non-diagnostic health policy");
}
export const LabResultExtractionV1 = z.object({
  schemaVersion: z.literal("LabResultExtractionV1"),
  entries: z.array(LabExtractedEntry).min(1).max(40),
  uncertainty: z.array(labNarrative(240)).max(8),
}).strict();
export type LabResultExtraction = z.infer<typeof LabResultExtractionV1>;
export function parseLabResultExtraction(input: unknown): LabResultExtraction { return LabResultExtractionV1.parse(input); }
