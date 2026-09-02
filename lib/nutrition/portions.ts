import type { Food, Portion, PortionSelection } from "./types";

function finitePositive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a finite positive number`);
  return value;
}

function formatQuantity(quantity: number): string {
  if (Number.isInteger(quantity)) return String(quantity);
  return String(Math.round(quantity * 100) / 100).replace(".", ",");
}

export function resolvePortionSelection(food: Food, selection: PortionSelection): Portion {
  if (selection.kind === "custom-grams") {
    const grams = finitePositive(selection.grams, "grams");
    return {
      food,
      grams,
      display: { label: `${formatQuantity(grams)} g` },
    };
  }

  const quantity = finitePositive(selection.quantity, "quantity");
  const option = food.portionOptions?.find((candidate) => candidate.id === selection.portionOptionId);
  if (!option) throw new Error(`Unknown portion option ${selection.portionOptionId} for food ${food.id}`);

  const gramsPerUnit = finitePositive(option.gramsPerUnit, "gramsPerUnit");
  const grams = Math.round((gramsPerUnit * quantity + Number.EPSILON) * 10) / 10;

  return {
    food,
    grams,
    display: {
      portionOptionId: option.id,
      quantity,
      label: `${formatQuantity(quantity)} ${option.label}`,
    },
  };
}

export function approximateGramLabel(portion: Portion): string {
  const rounded = Math.round(portion.grams);
  return `≈ ${rounded} g`;
}
