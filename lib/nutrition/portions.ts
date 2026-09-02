import type { Food, Portion, PortionSelection } from "./types";

const PORTION_GRAM_PRECISION = 0.1;

function finitePositive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a finite positive number`);
  return value;
}

function roundResolvedGrams(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function assertResolvedGramPrecision(value: number, kind: string): number {
  const grams = roundResolvedGrams(finitePositive(value, "grams"));
  if (grams < PORTION_GRAM_PRECISION) {
    throw new Error(`Resolved ${kind} portion is below ARVEN's 0.1 g precision; choose a larger amount`);
  }
  return grams;
}

export function formatPortionQuantity(quantity: number): string {
  if (Number.isInteger(quantity)) return String(quantity);
  return String(Math.round(quantity * 100) / 100).replace(".", ",");
}

export function canonicalHouseholdPortionLabel(quantity: number, optionLabel: string): string {
  const normalizedOption = optionLabel.trim().replace(/^1(?:[.,]0+)?\s+/u, "");
  return `${formatPortionQuantity(quantity)} ${normalizedOption}`.trim();
}

export function resolvePortionSelection(food: Food, selection: PortionSelection): Portion {
  if (selection.kind === "custom-grams") {
    const grams = assertResolvedGramPrecision(selection.grams, "custom");
    return {
      food,
      grams,
      display: { label: `${formatPortionQuantity(grams)} g` },
    };
  }

  const quantity = finitePositive(selection.quantity, "quantity");
  const option = food.portionOptions?.find((candidate) => candidate.id === selection.portionOptionId);
  if (!option) throw new Error(`Unknown portion option ${selection.portionOptionId} for food ${food.id}`);

  const gramsPerUnit = finitePositive(option.gramsPerUnit, "gramsPerUnit");
  const grams = assertResolvedGramPrecision(gramsPerUnit * quantity, "household");

  return {
    food,
    grams,
    display: {
      portionOptionId: option.id,
      quantity,
      label: canonicalHouseholdPortionLabel(quantity, option.label),
    },
  };
}

export function approximateGramLabel(portion: Portion): string {
  const rounded = Math.round(portion.grams);
  return `≈ ${rounded} g`;
}
