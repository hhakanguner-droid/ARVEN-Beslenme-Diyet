const DEFAULT_BASE_URL = "https://world.openfoodfacts.org";
const PRODUCT_FIELDS = "code,product_name,brands,quantity,nutriments,allergens_tags,categories_tags,nutrition_data_per";

export type OffNutrientField = { present: true; value: number } | { present: false };

export type OpenFoodFactsNutrition = {
  energyKcal: OffNutrientField;
  proteinG: OffNutrientField;
  carbsG: OffNutrientField;
  fatG: OffNutrientField;
  /** Frequently absent from OFF's real data — never backfilled from `nutrients_estimated`. */
  fiberG: OffNutrientField;
  sugarsG: OffNutrientField;
  saltG: OffNutrientField;
  sodiumG: OffNutrientField;
  nutritionDataPer: string | null;
};

export type OpenFoodFactsCandidate = {
  barcode: string;
  name: string | null;
  brand: string | null;
  quantity: string | null;
  nutrition: OpenFoodFactsNutrition;
  /** Raw, unmapped OFF tags (e.g. "en:milk"). Catalog-mapping to internal allergen/dietary-rule ids is future work. */
  rawAllergenTags: string[];
  rawCategoryTags: string[];
  provenance: { provider: "open-food-facts"; fetchedAt: string; sourceUrl: string };
};

export type OpenFoodFactsErrorCode = "network-error" | "http-error" | "rate-limited" | "malformed-response";

export class OpenFoodFactsError extends Error {
  constructor(readonly code: OpenFoodFactsErrorCode, message: string, readonly httpStatus?: number) {
    super(message);
    this.name = "OpenFoodFactsError";
  }
}

export type OffFetchResponse = { ok: boolean; status: number; json(): Promise<unknown> };
export type OffFetch = (url: string, init: { headers: Record<string, string> }) => Promise<OffFetchResponse>;

export type OffClientConfig = {
  userAgent: string;
  fetchImpl: OffFetch;
  baseUrl?: string;
};

function nutrientField(nutriments: Record<string, unknown>, key: string): OffNutrientField {
  const raw = nutriments[key];
  return typeof raw === "number" && Number.isFinite(raw) ? { present: true, value: raw } : { present: false };
}

function parseProduct(raw: unknown, sourceUrl: string): OpenFoodFactsCandidate {
  if (!raw || typeof raw !== "object") {
    throw new OpenFoodFactsError("malformed-response", "Open Food Facts product payload was not an object");
  }
  const p = raw as Record<string, unknown>;
  const nutriments = p.nutriments && typeof p.nutriments === "object" ? p.nutriments as Record<string, unknown> : {};
  const allergenTags = Array.isArray(p.allergens_tags) ? p.allergens_tags.filter((t): t is string => typeof t === "string") : [];
  const categoryTags = Array.isArray(p.categories_tags) ? p.categories_tags.filter((t): t is string => typeof t === "string") : [];

  return {
    barcode: typeof p.code === "string" ? p.code : "",
    name: typeof p.product_name === "string" && p.product_name.trim() ? p.product_name : null,
    brand: typeof p.brands === "string" && p.brands.trim() ? p.brands : null,
    quantity: typeof p.quantity === "string" && p.quantity.trim() ? p.quantity : null,
    nutrition: {
      energyKcal: nutrientField(nutriments, "energy-kcal_100g"),
      proteinG: nutrientField(nutriments, "proteins_100g"),
      carbsG: nutrientField(nutriments, "carbohydrates_100g"),
      fatG: nutrientField(nutriments, "fat_100g"),
      fiberG: nutrientField(nutriments, "fiber_100g"),
      sugarsG: nutrientField(nutriments, "sugars_100g"),
      saltG: nutrientField(nutriments, "salt_100g"),
      sodiumG: nutrientField(nutriments, "sodium_100g"),
      nutritionDataPer: typeof p.nutrition_data_per === "string" ? p.nutrition_data_per : null,
    },
    rawAllergenTags: allergenTags,
    rawCategoryTags: categoryTags,
    provenance: { provider: "open-food-facts", fetchedAt: new Date().toISOString(), sourceUrl },
  };
}

async function performRequest(url: string, config: OffClientConfig): Promise<unknown> {
  let response: OffFetchResponse;
  try {
    response = await config.fetchImpl(url, { headers: { "User-Agent": config.userAgent } });
  } catch (error) {
    throw new OpenFoodFactsError("network-error", error instanceof Error ? error.message : "Open Food Facts request failed");
  }
  if (response.status === 429) {
    throw new OpenFoodFactsError("rate-limited", "Open Food Facts rate limit exceeded", response.status);
  }
  if (!response.ok) {
    throw new OpenFoodFactsError("http-error", `Open Food Facts request failed with status ${response.status}`, response.status);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new OpenFoodFactsError("malformed-response", error instanceof Error ? error.message : "Open Food Facts response was not valid JSON");
  }
}

/** Pure core — barcode lookup. `status:0` (not found/invalid) is a normal outcome, not a thrown error. */
export async function lookupBarcode(
  barcode: string,
  config: OffClientConfig,
): Promise<OpenFoodFactsCandidate | { found: false; barcode: string }> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${PRODUCT_FIELDS}`;
  const body = await performRequest(url, config);
  if (!body || typeof body !== "object") {
    throw new OpenFoodFactsError("malformed-response", "Open Food Facts barcode response was not an object");
  }
  const b = body as Record<string, unknown>;
  if (b.status !== 1) return { found: false, barcode };
  return parseProduct(b.product, url);
}

/**
 * Pure core — free-text search via OFF's legacy `/cgi/search.pl` endpoint. The
 * officially-recommended replacement (search-a-licious) is, per OFF's own
 * docs, still unstable/undocumented as of this writing; this legacy endpoint
 * is verified live and functional. Revisit once search-a-licious stabilizes.
 */
export async function searchProducts(
  query: string,
  config: OffClientConfig,
  options?: { pageSize?: number },
): Promise<{ count: number; products: OpenFoodFactsCandidate[] }> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const pageSize = options?.pageSize ?? 20;
  const url = `${baseUrl}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=${pageSize}&fields=${PRODUCT_FIELDS}`;
  const body = await performRequest(url, config);
  if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>).products)) {
    throw new OpenFoodFactsError("malformed-response", "Open Food Facts search response was not the expected shape");
  }
  const b = body as Record<string, unknown>;
  const products = (b.products as unknown[]).map((product) => parseProduct(product, url));
  return { count: typeof b.count === "number" ? b.count : products.length, products };
}

/** Shape `V1MutationService.importVerifiedFood` accepts (see `lib/persistence/v1-boundary.ts`'s `VerifiedFoodImportV1`). */
export type VerifiedFoodImportInput = {
  schemaVersion: "VerifiedFoodImportV1";
  sourceProvider: "open-food-facts";
  sourceExternalId: string;
  barcode: string;
  name: string;
  brand: string | null;
  isLiquid: boolean;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sourceEvidenceUrl: string;
};

/**
 * Maps a raw Open Food Facts candidate into the import shape `V1MutationService.importVerifiedFood`
 * expects, or `null` when the candidate is missing one of the four macros ARVEN's catalog requires
 * for every food (energy/protein/carbs/fat — see `db/migrations/0001_initial.sql`'s `NOT NULL`
 * columns). Fiber is allowed to be absent, matching that same schema. `barcode` is passed in
 * explicitly rather than trusted from `candidate.barcode` alone, since a barcode-lookup caller
 * already knows the exact code it asked for and OFF's own `code` field is occasionally blank.
 */
export function candidateToVerifiedFoodImport(barcode: string, candidate: OpenFoodFactsCandidate): VerifiedFoodImportInput | null {
  const trimmedBarcode = barcode.trim();
  if (!trimmedBarcode) return null;
  const n = candidate.nutrition;
  if (!n.energyKcal.present || !n.proteinG.present || !n.carbsG.present || !n.fatG.present) return null;
  return {
    schemaVersion: "VerifiedFoodImportV1",
    sourceProvider: "open-food-facts",
    sourceExternalId: trimmedBarcode,
    barcode: trimmedBarcode,
    name: candidate.name ?? candidate.brand ?? trimmedBarcode,
    brand: candidate.brand,
    isLiquid: false,
    energyKcal: n.energyKcal.value,
    proteinG: n.proteinG.value,
    carbsG: n.carbsG.value,
    fatG: n.fatG.value,
    fiberG: n.fiberG.present ? n.fiberG.value : null,
    sourceEvidenceUrl: candidate.provenance.sourceUrl,
  };
}

export type OpenFoodFactsClient = {
  lookupBarcode: (barcode: string) => ReturnType<typeof lookupBarcode>;
  searchProducts: (query: string, options?: { pageSize?: number }) => ReturnType<typeof searchProducts>;
};

/** Production wrapper: uses the global `fetch` and an env-configured User-Agent contact string. */
export function createOpenFoodFactsClient(env?: { userAgent?: string }): OpenFoodFactsClient {
  const userAgent = env?.userAgent ?? process.env.OFF_CONTACT_USER_AGENT;
  if (!userAgent || !userAgent.trim()) {
    throw new Error("OFF_CONTACT_USER_AGENT must be configured to call the Open Food Facts API");
  }
  const config: OffClientConfig = { userAgent, fetchImpl: (url, init) => fetch(url, init) };
  return {
    lookupBarcode: (barcode: string) => lookupBarcode(barcode, config),
    searchProducts: (query: string, options?: { pageSize?: number }) => searchProducts(query, config, options),
  };
}

/**
 * Same as `createOpenFoodFactsClient`, but returns `null` instead of throwing when
 * `OFF_CONTACT_USER_AGENT` is not configured — for call sites (route handlers) where live
 * Open Food Facts lookup is an optional enhancement on top of the local catalog, not a
 * hard requirement, and a missing contact string should degrade gracefully rather than 500.
 */
export function getOptionalOpenFoodFactsClient(env?: { userAgent?: string }): OpenFoodFactsClient | null {
  const userAgent = env?.userAgent ?? process.env.OFF_CONTACT_USER_AGENT;
  if (!userAgent || !userAgent.trim()) return null;
  return createOpenFoodFactsClient({ userAgent });
}
