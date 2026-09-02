import assert from "node:assert/strict";
import test from "node:test";
import { parseMealSuggestion } from "../lib/ai/contracts";

const validSuggestion = {
  schemaVersion: "MealSuggestionV1",
  title: "Dengeli öğün",
  rationale: "Protein ve sebze ağırlıklı bir alternatif.",
  ingredients: [
    {
      foodQuery: "ızgara tavuk göğsü",
      portionHint: {
        measure: "palm",
        quantity: 1,
        naturalLabel: "1 avuç içi kadar",
      },
    },
  ],
  preparation: ["Izgarada pişir."],
  uncertainty: [],
};

test("AI meal contract accepts natural portion language", () => {
  const parsed = parseMealSuggestion(validSuggestion);
  assert.equal(parsed.ingredients[0]?.portionHint.measure, "palm");
});

test("AI meal contract rejects suggested grams", () => {
  const invalid = {
    ...validSuggestion,
    ingredients: [
      {
        ...validSuggestion.ingredients[0],
        suggestedGrams: 120,
      },
    ],
  };

  assert.throws(() => parseMealSuggestion(invalid));
});

test("AI meal contract rejects AI-authored calorie totals", () => {
  const invalid = { ...validSuggestion, energyKcal: 430 };
  assert.throws(() => parseMealSuggestion(invalid));
});
