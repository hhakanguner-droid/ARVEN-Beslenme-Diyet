/**
 * Deterministic, non-AI supplement reference notes — the "safe contextual explanations" ARVEN's
 * Phase 6 roadmap entry calls for, without any of the risk a generative explanation would carry.
 * Every note here is a short, static, general-knowledge sentence, written once by a human, never
 * generated per-request: there is no model in this path, so there is nothing to jailbreak into a
 * diagnosis or a dosage recommendation. Explicitly NOT medical advice and says so; matching is by
 * normalized name so "D vitamini", "D Vitamini" and "vitamin d" all resolve to the same note.
 */
export type SupplementReferenceNote = { name: string; note: string };

const NOTES: Record<string, string> = {
  "d vitamini": "Kemik sağlığı ve bağışıklıkla ilişkilendirilen, güneş ışığıyla da üretilebilen yağda çözünen bir vitamindir.",
  "vitamin d": "Kemik sağlığı ve bağışıklıkla ilişkilendirilen, güneş ışığıyla da üretilebilen yağda çözünen bir vitamindir.",
  "b12": "Sinir sistemi ve kan hücresi oluşumunda rol oynayan, çoğunlukla hayvansal gıdalarda bulunan bir vitamindir.",
  "b12 vitamini": "Sinir sistemi ve kan hücresi oluşumunda rol oynayan, çoğunlukla hayvansal gıdalarda bulunan bir vitamindir.",
  "demir": "Kanda oksijen taşınmasında görev alan bir mineraldir; bazı gıdalarla birlikte alındığında emilimi değişebilir.",
  "magnezyum": "Kas ve sinir işleviyle ilişkilendirilen, birçok gıdada doğal olarak bulunan bir mineraldir.",
  "omega 3": "Balık ve bazı bitkisel yağlarda bulunan, çoğunlukla kalp ve beyin sağlığıyla ilişkilendirilen bir yağ asidi grubudur.",
  "omega-3": "Balık ve bazı bitkisel yağlarda bulunan, çoğunlukla kalp ve beyin sağlığıyla ilişkilendirilen bir yağ asidi grubudur.",
  "multivitamin": "Birden fazla vitamin ve minerali bir arada içeren, genel beslenmeyi tamamlamak amacıyla kullanılan bir üründür.",
  "probiyotik": "Bağırsak florasını desteklediği düşünülen canlı mikroorganizma içeren bir üründür.",
  "cinko": "Bağışıklık ve yara iyileşmesiyle ilişkilendirilen, birçok gıdada doğal olarak bulunan bir mineraldir.",
  "çinko": "Bağışıklık ve yara iyileşmesiyle ilişkilendirilen, birçok gıdada doğal olarak bulunan bir mineraldir.",
  "kalsiyum": "Kemik ve diş sağlığında temel rol oynayan bir mineraldir; süt ürünleri başlıca kaynaklarından biridir.",
  "c vitamini": "Bağışıklık sistemini desteklediği düşünülen, birçok meyve ve sebzede bulunan suda çözünen bir vitamindir.",
  "vitamin c": "Bağışıklık sistemini desteklediği düşünülen, birçok meyve ve sebzede bulunan suda çözünen bir vitamindir.",
};

function normalize(name: string): string {
  return name.trim().toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/\s+/g, " ");
}

/** Only names explicitly present in the curated supplement reference are accepted as free text. */
export function isKnownSupplementName(name: string): boolean {
  const normalized = normalize(name);
  return Object.keys(NOTES).some((key) => normalize(key) === normalized);
}

/**
 * Looks up a short, static informational note for a supplement name, or null when nothing matches
 * (an unrecognized or free-text name — the client should show nothing rather than guess). Never
 * calls the AI provider; this is the deterministic half of Phase 6's "safe contextual explanations,
 * no diagnosis/treatment/medication instructions" requirement.
 */
export function lookupSupplementReferenceNote(name: string): SupplementReferenceNote | null {
  const normalized = normalize(name);
  for (const [key, note] of Object.entries(NOTES)) {
    if (normalize(key) === normalized) return { name, note };
  }
  return null;
}
