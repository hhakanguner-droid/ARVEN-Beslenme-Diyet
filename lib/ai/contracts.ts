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

export const MealSuggestionV1 = z.object({
  schemaVersion: z.literal("MealSuggestionV1"),
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(600),
  ingredients: z.array(z.object({
    foodQuery: z.string().min(1).max(120),
    portionHint: z.object({
      measure: PortionMeasure,
      quantity: z.number().positive().max(20),
      size: PortionSize.optional(),
      naturalLabel: z.string().min(1).max(120),
    }),
  })).min(1).max(20),
  preparation: z.array(z.string().min(1).max(300)).max(12),
  uncertainty: z.array(z.string().min(1).max(240)).max(8),
});

export type MealSuggestion = z.infer<typeof MealSuggestionV1>;

/**
 * Deliberately absent from the AI schema: grams, calories, protein,
 * carbohydrate, fat and other nutrient totals. AI speaks in natural portion
 * language. The server resolves that hint against verified FoodPortionOptions,
 * converts it to grams internally, then calculates nutrition deterministically.
 */
export function parseMealSuggestion(input: unknown): MealSuggestion {
  return MealSuggestionV1.parse(input);
}
