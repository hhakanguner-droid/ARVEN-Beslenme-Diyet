import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoAllergyConflict,
  assertNoDietaryExclusionConflict,
  assertNoMedicalOverreach,
} from "../lib/health-safety/policy";

test("allergy conflicts use verified allergen identifiers rather than food names", () => {
  assert.throws(
    () => assertNoAllergyConflict([
      { foodId: "yogurt-1", foodName: "Yoğurt", allergenDataStatus: "verified", allergenIds: ["milk"] },
    ], ["milk"]),
    /Allergy conflict/,
  );
  assert.throws(
    () => assertNoAllergyConflict([
      { foodId: "tahini-1", foodName: "Tahin", allergenDataStatus: "verified", allergenIds: ["sesame"] },
    ], ["sesame"]),
    /Allergy conflict/,
  );
});

test("unknown allergen data is blocked when a user has active allergies", () => {
  assert.throws(
    () => assertNoAllergyConflict([
      { foodId: "unknown-1", foodName: "Kaynağı belirsiz ürün", allergenDataStatus: "unknown", allergenIds: [] },
    ], ["milk"]),
    /unresolved/,
  );
});

test("verified non-conflicting food is allowed", () => {
  assert.doesNotThrow(() => assertNoAllergyConflict([
    { foodId: "zucchini-1", foodName: "Izgara kabak", allergenDataStatus: "verified", allergenIds: [] },
  ], ["milk"]));
});

test("AI medication or treatment management is blocked without storing a medication registry", () => {
  const unsafe = [
    "Bu durumda ilacı bırak.",
    "Dozu azalt.",
    "Medikasyonu değiştir.",
    "Tedaviyi durdur.",
    "Metformini artık alma.",
    "Metformin dozunu atla.",
    "Euthyrox kullanımını sürdür.",
  ];

  for (const message of unsafe) {
    assert.throws(() => assertNoMedicalOverreach(message), /non-diagnostic/, message);
  }

  assert.doesNotThrow(() => assertNoMedicalOverreach("Bu sonuçları bir sağlık profesyoneliyle değerlendirmen uygun olur."));
});

test("direct diagnosis assertions are rejected", () => {
  const unsafe = [
    "Sende diyabet var.",
    "Bu belirtiler çölyak olduğunu gösteriyor.",
    "Bu değerlere göre teşhisin kesin.",
  ];

  for (const message of unsafe) {
    assert.throws(() => assertNoMedicalOverreach(message), /non-diagnostic/, message);
  }
});

test("explicit dietary exclusions are hard blocks and unresolved exclusions fail closed", () => {
  const candidate = [{
    foodId: "beef-1",
    foodName: "Dana eti",
    dietarySafetyDataStatus: "verified" as const,
    dietaryConflictRuleIds: ["vegetarian"],
  }];

  assert.throws(() => assertNoDietaryExclusionConflict(candidate, [{
    kind: "food", id: "beef-1", label: "Dana eti", resolutionStatus: "resolved",
  }]), /Dietary safety conflict/);

  assert.throws(() => assertNoDietaryExclusionConflict(candidate, [{
    kind: "rule", id: "vegetarian", label: "Vejetaryen", resolutionStatus: "resolved",
  }]), /Dietary safety conflict/);

  assert.throws(() => assertNoDietaryExclusionConflict(candidate, [{
    kind: "food", id: null, label: "Kullanıcının kaçındığı besin", resolutionStatus: "unresolved",
  }]), /unresolved/);
});
