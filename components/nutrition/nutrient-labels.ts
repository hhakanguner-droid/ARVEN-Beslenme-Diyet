/** Turkish display labels for the extended (vitamin/mineral) nutrient keys in `lib/nutrition/nutrients.ts`. */
export const NUTRIENT_LABELS: Record<string, string> = {
  "saturated-fat": "Doymuş yağ",
  "trans-fat": "Trans yağ",
  "monounsaturated-fat": "Tekli doymamış yağ",
  "polyunsaturated-fat": "Çoklu doymamış yağ",
  "omega-3": "Omega-3",
  "omega-6": "Omega-6",
  sugars: "Şeker",
  "added-sugars": "Eklenmiş şeker",
  sodium: "Sodyum",
  salt: "Tuz",
  cholesterol: "Kolesterol",
  caffeine: "Kafein",
  calcium: "Kalsiyum",
  iron: "Demir",
  potassium: "Potasyum",
  magnesium: "Magnezyum",
  zinc: "Çinko",
  phosphorus: "Fosfor",
  selenium: "Selenyum",
  iodine: "İyot",
  "vitamin-a": "A Vitamini",
  "vitamin-b1": "B1 Vitamini",
  "vitamin-b2": "B2 Vitamini",
  "vitamin-b3": "B3 Vitamini",
  "vitamin-b5": "B5 Vitamini",
  "vitamin-b6": "B6 Vitamini",
  "vitamin-b7": "B7 Vitamini",
  "vitamin-b9": "B9 Vitamini (Folat)",
  "vitamin-b12": "B12 Vitamini",
  "vitamin-c": "C Vitamini",
  "vitamin-d": "D Vitamini",
  "vitamin-e": "E Vitamini",
  "vitamin-k": "K Vitamini",
};

export function nutrientLabel(key: string): string {
  return NUTRIENT_LABELS[key] ?? key;
}

export const COMPLETENESS_LABELS: Record<string, string> = {
  complete: "tam",
  partial: "kısmi",
  unknown: "bilinmiyor",
};
