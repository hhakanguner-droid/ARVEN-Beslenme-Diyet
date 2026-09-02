const MEDICAL_OVERREACH_PATTERNS = [
  /tan[ıi] koy/i,
  /ilac[ıi].*(b[ıi]rak|kes)/i,
  /doz.*(art[ıi]r|azalt)/i,
  /tedavi.*(ba[sş]la|uygula)/i,
];

export function assertNoMedicalOverreach(text: string): void {
  if (MEDICAL_OVERREACH_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error("AI output violates ARVEN non-diagnostic health policy");
  }
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

export function findAllergyConflicts(candidateFoods: string[], allergies: string[]): string[] {
  const blocked = allergies.map(normalized).filter(Boolean);
  return candidateFoods.filter((food) => {
    const candidate = normalized(food);
    return blocked.some((allergen) => candidate.includes(allergen));
  });
}

export function assertNoAllergyConflict(candidateFoods: string[], allergies: string[]): void {
  const conflicts = findAllergyConflicts(candidateFoods, allergies);
  if (conflicts.length > 0) {
    throw new Error(`Allergy conflict detected: ${conflicts.join(", ")}`);
  }
}
