import { z } from "zod";

const PortionMeasure = z.enum([
  "piece",
  "slice",
  "teaspoon",
  "tablespoon",
  "tea-glass",
  "water-glass",
  "cup",
  "bowl",
  "handful",
  "palm",
  "serving",
  "package",
  "bottle",
  "can",
  "ladle",
]);

const PortionSize = z.enum(["small", "medium", "large"]);

const PortionHint = z.object({
  measure: PortionMeasure,
  quantity: z.number().positive().max(20),
  size: PortionSize.optional(),
  naturalLabel: z.string().min(1).max(120),
}).strict();

const SuggestedIngredient = z.object({
  foodQuery: z.string().min(1).max(120),
  portionHint: PortionHint,
}).strict();

export const MealSuggestionV1 = z.object({
  schemaVersion: z.literal("MealSuggestionV1"),
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(600),
  ingredients: z.array(SuggestedIngredient).min(1).max(20),
  preparation: z.array(z.string().min(1).max(300)).max(12),
  uncertainty: z.array(z.string().min(1).max(240)).max(8),
}).strict();

export type MealSuggestion = z.infer<typeof MealSuggestionV1>;

export const WeeklyInsightV1 = z.object({
  schemaVersion: z.literal("WeeklyInsightV1"),
  summary: z.string().min(1).max(900),
  positives: z.array(z.string().min(1).max(300)).max(6),
  areasForImprovement: z.array(z.string().min(1).max(300)).max(6),
  suggestions: z.array(z.string().min(1).max(300)).max(6),
  uncertainty: z.array(z.string().min(1).max(240)).max(6),
}).strict();

export type WeeklyInsight = z.infer<typeof WeeklyInsightV1>;

/**
 * Deliberately absent from the AI schema: grams, calories, protein,
 * carbohydrate, fat and other nutrient totals. Strict schemas reject those
 * fields if a model tries to include them. AI speaks in natural portion
 * language. The server resolves that hint against verified FoodPortionOptions,
 * converts it to grams internally, then calculates nutrition deterministically.
 */
export function parseMealSuggestion(input: unknown): MealSuggestion {
  return MealSuggestionV1.parse(input);
}

/**
 * Weekly numeric metrics (adherence, averages, trends) are computed before the
 * model call. The model may interpret them but cannot author replacement scores.
 */
export function parseWeeklyInsight(input: unknown): WeeklyInsight {
  return WeeklyInsightV1.parse(input);
}
