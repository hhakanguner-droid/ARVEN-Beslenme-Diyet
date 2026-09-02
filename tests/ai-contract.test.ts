import assert from "node:assert/strict";
import test from "node:test";
import { parseMealSuggestion, parseWeeklyInsight } from "../lib/ai/contracts";

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

test("AI meal text cannot smuggle numeric gram or calorie claims", () => {
  assert.throws(() => parseMealSuggestion({
    ...validSuggestion,
    rationale: "Bu öğün 430 kcal içerir.",
  }), /numeric nutrition/);

  assert.throws(() => parseMealSuggestion({
    ...validSuggestion,
    rationale: "Bu öğün dört yüz kalori içerir.",
  }), /numeric nutrition/);

  assert.throws(() => parseMealSuggestion({
    ...validSuggestion,
    ingredients: [{
      ...validSuggestion.ingredients[0],
      portionHint: {
        ...validSuggestion.ingredients[0].portionHint,
        naturalLabel: "120 g tavuk",
      },
    }],
  }), /Natural portion labels/);
});

test("weekly insight contract accepts qualitative narrative interpretation", () => {
  const parsed = parseWeeklyInsight({
    schemaVersion: "WeeklyInsightV1",
    summary: "Bu hafta öğün kayıtlarında daha düzenli ritim oluştu.",
    positives: ["Planlanan öğünleri daha düzenli kaydettin."],
    areasForImprovement: ["Su kaydı bazı günlerde eksik kaldı."],
    suggestions: ["Su kaydını gün içine dağıtmayı deneyebilirsin."],
    uncertainty: ["Eksik kayıt bulunan günler yorumun güvenini azaltıyor."],
  });
  assert.equal(parsed.positives.length, 1);
});

test("weekly AI insight cannot author adherence or calorie fields", () => {
  assert.throws(() => parseWeeklyInsight({
    schemaVersion: "WeeklyInsightV1",
    summary: "Özet",
    positives: [],
    areasForImprovement: [],
    suggestions: [],
    uncertainty: [],
    adherenceScore: 82,
    averageCalories: 1940,
  }));
});

test("weekly AI insight cannot hide invented numeric truth inside narrative strings", () => {
  const invalidSummaries = [
    "Uyum puanın %97 ve ortalaman 1900 kcal.",
    "Uyumun yüzde doksan yedi.",
    "Ortalaman iki bin kalori civarında.",
    "Hedefin yüzde seksenine yaklaştın.",
  ];

  for (const summary of invalidSummaries) {
    assert.throws(() => parseWeeklyInsight({
      schemaVersion: "WeeklyInsightV1",
      summary,
      positives: [],
      areasForImprovement: [],
      suggestions: [],
      uncertainty: [],
    }), /must not contain numeric claims/, summary);
  }
});
