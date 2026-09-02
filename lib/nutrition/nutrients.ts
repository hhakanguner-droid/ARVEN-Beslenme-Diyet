export type ExtendedNutrientKey =
  | "saturated-fat"
  | "trans-fat"
  | "monounsaturated-fat"
  | "polyunsaturated-fat"
  | "omega-3"
  | "omega-6"
  | "sugars"
  | "added-sugars"
  | "sodium"
  | "salt"
  | "cholesterol"
  | "caffeine"
  | "calcium"
  | "iron"
  | "potassium"
  | "magnesium"
  | "zinc"
  | "phosphorus"
  | "selenium"
  | "iodine"
  | "vitamin-a"
  | "vitamin-b1"
  | "vitamin-b2"
  | "vitamin-b3"
  | "vitamin-b5"
  | "vitamin-b6"
  | "vitamin-b7"
  | "vitamin-b9"
  | "vitamin-b12"
  | "vitamin-c"
  | "vitamin-d"
  | "vitamin-e"
  | "vitamin-k";

export type NutrientUnit = "g" | "mg" | "mcg";
export type NutrientCompleteness = "complete" | "partial" | "unknown";

export type NutrientValue = {
  amount: number | null;
  unit: NutrientUnit;
  completeness: NutrientCompleteness;
};

export type ExtendedNutritionFacts = Partial<Record<ExtendedNutrientKey, NutrientValue>>;

export const NUTRIENT_UNITS: Readonly<Record<ExtendedNutrientKey, NutrientUnit>> = {
  "saturated-fat": "g",
  "trans-fat": "g",
  "monounsaturated-fat": "g",
  "polyunsaturated-fat": "g",
  "omega-3": "g",
  "omega-6": "g",
  sugars: "g",
  "added-sugars": "g",
  sodium: "mg",
  salt: "g",
  cholesterol: "mg",
  caffeine: "mg",
  calcium: "mg",
  iron: "mg",
  potassium: "mg",
  magnesium: "mg",
  zinc: "mg",
  phosphorus: "mg",
  selenium: "mcg",
  iodine: "mcg",
  "vitamin-a": "mcg",
  "vitamin-b1": "mg",
  "vitamin-b2": "mg",
  "vitamin-b3": "mg",
  "vitamin-b5": "mg",
  "vitamin-b6": "mg",
  "vitamin-b7": "mcg",
  "vitamin-b9": "mcg",
  "vitamin-b12": "mcg",
  "vitamin-c": "mg",
  "vitamin-d": "mcg",
  "vitamin-e": "mg",
  "vitamin-k": "mcg",
};

const NUTRIENT_KEY_SET = new Set<string>(Object.keys(NUTRIENT_UNITS));

export function isExtendedNutrientKey(value: string): value is ExtendedNutrientKey {
  return NUTRIENT_KEY_SET.has(value);
}

function finiteNonNegativeOrNull(value: number | null, field: string): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be null or a finite non-negative number`);
  return value;
}

function assertNutrientValueSemantics(value: NutrientValue, field: string): void {
  const amount = finiteNonNegativeOrNull(value.amount, `${field} amount`);
  if (amount == null && value.completeness !== "unknown") {
    throw new Error(`${field} with a null amount must use unknown completeness`);
  }
}

export function assertCanonicalNutrientValue(key: string, value: NutrientValue): asserts key is ExtendedNutrientKey {
  if (!isExtendedNutrientKey(key)) throw new Error(`Unsupported nutrient key: ${key}`);
  const expectedUnit = NUTRIENT_UNITS[key];
  if (value.unit !== expectedUnit) {
    throw new Error(`Nutrient ${key} must use canonical unit ${expectedUnit}; got ${value.unit}`);
  }
  assertNutrientValueSemantics(value, `Nutrient ${key}`);
}

export function assertExtendedNutritionFacts(extended: ExtendedNutritionFacts | undefined): void {
  if (!extended) return;
  for (const [key, value] of Object.entries(extended)) {
    if (!value) continue;
    assertCanonicalNutrientValue(key, value);
  }
}

export function scaleNutrientValue(value: NutrientValue, ratio: number): NutrientValue {
  if (!Number.isFinite(ratio) || ratio < 0) throw new Error("ratio must be a finite non-negative number");
  assertNutrientValueSemantics(value, "nutrient");
  if (value.amount == null) {
    return { ...value, amount: null, completeness: "unknown" };
  }
  return {
    ...value,
    amount: Math.round((value.amount * ratio + Number.EPSILON) * 1000) / 1000,
  };
}

export function sumNutrientValues(values: NutrientValue[], unit: NutrientUnit): NutrientValue {
  if (values.length === 0) return { amount: 0, unit, completeness: "complete" };
  for (const value of values) {
    if (value.unit !== unit) throw new Error(`Cannot sum nutrient units ${value.unit} and ${unit}`);
    assertNutrientValueSemantics(value, "nutrient");
  }

  const knownAmounts = values
    .map((value) => value.amount)
    .filter((value): value is number => value != null);

  const amount = knownAmounts.length === 0
    ? null
    : Math.round((knownAmounts.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 1000) / 1000;

  const allComplete = values.every(
    (value) => value.amount != null && value.completeness === "complete",
  );
  const completeness: NutrientCompleteness = amount == null
    ? "unknown"
    : allComplete
      ? "complete"
      : "partial";

  return { amount, unit, completeness };
}

export function sumExtendedNutrition(items: ExtendedNutritionFacts[]): ExtendedNutritionFacts {
  const keys = new Set<ExtendedNutrientKey>();
  for (const item of items) {
    assertExtendedNutritionFacts(item);
    for (const rawKey of Object.keys(item)) {
      if (!isExtendedNutrientKey(rawKey)) throw new Error(`Unsupported nutrient key: ${rawKey}`);
      keys.add(rawKey);
    }
  }

  const result: ExtendedNutritionFacts = {};
  for (const key of keys) {
    const unit = NUTRIENT_UNITS[key];
    const values = items.map((item) => item[key] ?? { amount: null, unit, completeness: "unknown" as const });
    result[key] = sumNutrientValues(values, unit);
  }
  return result;
}
