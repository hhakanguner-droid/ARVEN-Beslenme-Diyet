import { z } from "zod";

const PortionMeasure = z.enum([
  "piece", "slice", "teaspoon", "tablespoon", "tea-glass", "water-glass", "cup", "bowl",
  "handful", "palm", "serving", "package", "bottle", "can", "ladle",
]);
const PortionSize = z.enum(["small", "medium", "large"]);
const ANY_DIGIT = /\p{N}/u;
const NUMBER_WORDS = new Set([
  "sifir", "iki", "uc", "dort", "bes", "alti", "yedi", "sekiz", "dokuz", "on", "yirmi", "otuz",
  "kirk", "elli", "altmis", "yetmis", "seksen", "doksan", "yuz", "bin", "milyon", "milyar", "trilyon",
  "yarim", "bucuk", "ceyrek", "yuzde", "zero", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred",
  "thousand", "million", "billion", "half", "quarter", "percent",
]);
const TURKISH_NUMBER_SUFFIXES = new Set([
  "i", "u", "a", "e", "si", "su", "in", "un", "nin", "nun", "ini", "unu", "sini", "sunu", "ina", "ine",
  "una", "une", "sina", "sine", "suna", "sune", "dan", "den", "tan", "ten", "da", "de", "ta", "te", "ya",
  "ye", "lar", "ler", "lari", "leri", "larin", "lerin", "lara", "lere", "lik", "luk", "inci", "uncu",
]);
const NUTRITION_UNIT_PATTERN = "(?:kcal|kilokalori[a-z]*|kilocalorie[a-z]*|calorie[a-z]*|calories|kj|kilojul[a-z]*|kilojoule[a-z]*|kalori[a-z]*|gram[a-z]*|miligram[a-z]*|mikrogram[a-z]*|mililitre[a-z]*|millilitre[a-z]*|litre[a-z]*|milligram[a-z]*|microgram[a-z]*|milliliter[a-z]*|liter[a-z]*|gr|g|mg|mcg|ml|kg|l)";

function normalizeNumberText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c")
    .replace(/ö/g, "o").replace(/ü/g, "u").replace(/[^a-z0-9\s.,+\-]/g, " ").replace(/\s+/g, " ");
}
function isWrittenNumberToken(token: string): boolean {
  if (NUMBER_WORDS.has(token)) return true;
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
  const unitOrMetric = `${NUTRITION_UNIT_PATTERN}|puan|adim|saat|gun|hafta|ogun|porsiyon|kilo|kilogram`;
  const directOne = new RegExp(`\\b(?:yuzde\\s+bir|percent\\s+one|bir\\s+(?:${unitOrMetric})|one\\s+(?:${NUTRITION_UNIT_PATTERN}|point|step|hour|day|week))\\b`, "i");
  const frequencyOne = /\bbir(?:er)?\s+(?:kez|defa|kere)(?:den|dan|ten|tan|de|da|ye|ya)?\b/i;
  return directOne.test(normalized) || frequencyOne.test(normalized);
}
function containsDigitNutritionClaim(value: string): boolean {
  const normalized = normalizeNumberText(value);
  const numericLiteral = "\\d+(?:[.,]\\d+)?(?:e[+\\-]?\\d+)?";
  return new RegExp(`\\b${numericLiteral}\\s*${NUTRITION_UNIT_PATTERN}\\b`, "i").test(normalized);
}
function containsSpelledNutritionClaim(value: string): boolean {
  const normalized = normalizeNumberText(value);
  return new RegExp(`\\b${NUTRITION_UNIT_PATTERN}\\b`, "i").test(normalized)
    && (containsSpelledNumberWord(normalized) || containsContextualOneClaim(normalized));
}
function containsWeeklyNumericClaim(value: string): boolean {
  return ANY_DIGIT.test(value) || containsSpelledNumberWord(value) || containsContextualOneClaim(value);
}
function mealNarrative(max: number) {
  return z.string().min(1).max(max).refine(
    (value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
    "AI meal text must not contain numeric nutrition/weight claims",
  );
}
function weeklyNarrative(max: number) {
  return z.string().min(1).max(max).refine((value) => !containsWeeklyNumericClaim(value),
    "Weekly narrative must not contain numeric claims; render deterministic metrics separately");
}
const NaturalPortionLabel = z.string().min(1).max(120).refine(
  (value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
  "Natural portion labels must not smuggle gram/ml nutrition quantities",
);
const FoodQuery = z.string().min(1).max(120).refine(
  (value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
  "Food queries must not contain model-authored gram or nutrition quantities",
);
const PortionHint = z.object({ measure: PortionMeasure, quantity: z.number().positive().max(20), size: PortionSize.optional(), naturalLabel: NaturalPortionLabel }).strict();
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
