import assert from "node:assert/strict";
import test from "node:test";
import { assertNoAllergyConflict, assertNoMedicalOverreach } from "../lib/health-safety/policy";

test("allergy conflicts use verified allergen identifiers rather than food names", () => {
  assert.throws(
    () => assertNoAllergyConflict([
      {
        foodId: "yogurt-1",
        foodName: "Yoğurt",
        allergenDataStatus: "verified",
        allergenIds: ["milk"],
      },
    ], ["milk"]),
    /Allergy conflict/,
  );

  assert.throws(
    () => assertNoAllergyConflict([
      {
        foodId: "tahini-1",
        foodName: "Tahin",
        allergenDataStatus: "verified",
        allergenIds: ["sesame"],
      },
    ], ["sesame"]),
    /Allergy conflict/,
  );
});

test("unknown allergen data is blocked when a user has active allergies", () => {
  assert.throws(
    () => assertNoAllergyConflict([
      {
        foodId: "unknown-1",
        foodName: "Kaynağı belirsiz ürün",
        allergenDataStatus: "unknown",
        allergenIds: [],
      },
    ], ["milk"]),
    /unresolved/,
  );
});

test("verified non-conflicting food is allowed", () => {
  assert.doesNotThrow(() => assertNoAllergyConflict([
    {
      foodId: "zucchini-1",
      foodName: "Izgara kabak",
      allergenDataStatus: "verified",
      allergenIds: [],
    },
  ], ["milk"]));
});

test("Turkish medication-changing language across common inflections is rejected", () => {
  const unsafe = [
    "Bu durumda ilacı bırak.",
    "İlaçları bırak.",
    "İlaç kullanımını kes.",
    "Dozu azalt.",
    "Medikasyonu değiştir.",
    "Tedaviyi durdur.",
  ];

  for (const message of unsafe) {
    assert.throws(() => assertNoMedicalOverreach(message), /non-diagnostic/, message);
  }

  assert.doesNotThrow(() => assertNoMedicalOverreach("Bu sonuçları doktorunla değerlendirmen uygun olur."));
});
