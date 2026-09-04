export const MEAL_TYPE_OPTIONS = [
  { value: "breakfast", label: "Kahvaltı" },
  { value: "morning-snack", label: "Kuşluk" },
  { value: "lunch", label: "Öğle yemeği" },
  { value: "afternoon-snack", label: "İkindi" },
  { value: "dinner", label: "Akşam yemeği" },
  { value: "snack", label: "Ara öğün" },
  { value: "custom", label: "Diğer" },
] as const;

export function mealTypeLabel(value: string): string {
  return MEAL_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
