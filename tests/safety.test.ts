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

test("malformed active or candidate allergen identifiers fail closed", () => {
  const candidate = [
    { foodId: "zucchini-1", foodName: "Izgara kabak", allergenDataStatus: "verified" as const, allergenIds: [] },
  ];
  assert.throws(() => assertNoAllergyConflict(candidate, ["   "]), /unresolved/);
  assert.throws(() => assertNoAllergyConflict([
    { foodId: "mystery-1", foodName: "Belirsiz etiket", allergenDataStatus: "verified", allergenIds: ["   "] },
  ], ["milk"]), /unresolved/);
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
    "Aspirin kullanmalısın.",
    "Metformini almalısın.",
    "Aspirin'i bırak.",
    "Metformin'e başla.",
    "Bunu ilacın yerine kullanmamalısın.",
    "Bu ilacı kullanman gerekiyor.",
  ];

  for (const message of unsafe) {
    assert.throws(() => assertNoMedicalOverreach(message), /non-diagnostic/, message);
  }

  assert.doesNotThrow(() => assertNoMedicalOverreach("Bu sonuçları bir sağlık profesyoneliyle değerlendirmen uygun olur."));
});

test("ordinary nutrition commands are not mistaken for medication management", () => {
  for (const message of ["Meyve al.", "Zeytinyağı kullan.", "Ekmeği kes.", "Tuzu azalt."]) {
    assert.doesNotThrow(() => assertNoMedicalOverreach(message), message);
  }
});

test("direct diagnosis assertions are rejected without blocking ordinary coaching predicates", () => {
  const unsafe = [
    "Sende diyabet var.",
    "Diyabetin var.",
    "Bu belirtiler çölyak olduğunu gösteriyor.",
    "Bu değerlere göre teşhisin kesin.",
    "Diyabet hastasısın.",
    "Sen çölyaksın.",
    "Bu diyabettir.",
  ];

  for (const message of unsafe) {
    assert.throws(() => assertNoMedicalOverreach(message), /non-diagnostic/, message);
  }

  for (const message of ["Sen kararlısın.", "Bu dengelidir.", "Bu doğrudur."]) {
    assert.doesNotThrow(() => assertNoMedicalOverreach(message), message);
  }
});

test("explicit dietary exclusions are hard blocks and malformed exclusions fail closed", () => {
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

  for (const exclusion of [
    { kind: "food" as const, id: null, label: "Kullanıcının kaçındığı besin", resolutionStatus: "unresolved" as const },
    { kind: "food" as const, id: "   ", label: "Bozuk dışlama", resolutionStatus: "resolved" as const },
  ]) {
    assert.throws(() => assertNoDietaryExclusionConflict(candidate, [exclusion]), /unresolved/);
  }
});

test("malformed candidate dietary-rule identifiers fail closed", () => {
  assert.throws(() => assertNoDietaryExclusionConflict([{
    foodId: "mystery-food",
    foodName: "Belirsiz ürün",
    dietarySafetyDataStatus: "verified",
    dietaryConflictRuleIds: ["   "],
  }], [{
    kind: "rule",
    id: "vegetarian",
    label: "Vejetaryen",
    resolutionStatus: "resolved",
  }]), /dietary rule identifier unresolved/);
});
