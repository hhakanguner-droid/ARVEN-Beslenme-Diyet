import assert from "node:assert/strict";
import test from "node:test";
import {
  lookupBarcode,
  OpenFoodFactsError,
  searchProducts,
  type OffFetch,
  type OffFetchResponse,
} from "../lib/nutrition/providers/open-food-facts";

const USER_AGENT = "ARVEN-Beslenme-Diyet/0.1 (hhakanguner@gmail.com)";
const BASE_URL = "https://off.test";

// Real payload for barcode 3017620422003, captured from the live API — note there is
// no `fiber_100g` key in `nutriments` at all, only in the separate, non-verified
// `nutrients_estimated` object (which the parser must never read).
const NUTELLA_PAYLOAD = {
  code: "3017620422003",
  product: {
    code: "3017620422003",
    product_name: "Nutella",
    brands: "Nutella, Ferrero, Yum yum",
    quantity: "",
    nutrition_data_per: "100g",
    allergens_tags: ["en:milk", "en:nuts", "en:soybeans"],
    categories_tags: ["en:breakfasts", "en:spreads"],
    nutriments: {
      "energy-kcal_100g": 539,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      proteins_100g: 6.3,
      sugars_100g: 56.3,
      salt_100g: 0.107,
      sodium_100g: 0.0428,
    },
    nutrients_estimated: {
      fiber_100g: 3.67525,
    },
  },
  status: 1,
  status_verbose: "product found",
};

const YOGURT_PAYLOAD = {
  code: "20047559",
  product_name: "Ghani",
  brands: "Pilos",
  nutrition_data_per: "100g",
  allergens_tags: [],
  categories_tags: ["en:dairies"],
  nutriments: {
    "energy-kcal_100g": 96.2,
    carbohydrates_100g: 3.2,
    fat_100g: 10,
    proteins_100g: 4.6,
    fiber_100g: 0.5,
    sugars_100g: 0,
    salt_100g: 0.1,
    sodium_100g: 0.04,
  },
};

function fakeFetch(handler: (url: string, init: { headers: Record<string, string> }) => OffFetchResponse): OffFetch {
  return async (url, init) => handler(url, init);
}

function jsonResponse(body: unknown, status = 200): OffFetchResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("barcode lookup builds the correct URL and User-Agent header", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  const fetchImpl = fakeFetch((url, init) => {
    capturedUrl = url;
    capturedHeaders = init.headers;
    return jsonResponse(NUTELLA_PAYLOAD);
  });
  await lookupBarcode("3017620422003", { userAgent: USER_AGENT, fetchImpl, baseUrl: BASE_URL });
  assert.equal(capturedUrl, `${BASE_URL}/api/v2/product/3017620422003.json?fields=code,product_name,brands,quantity,nutriments,allergens_tags,categories_tags,nutrition_data_per`);
  assert.equal(capturedHeaders["User-Agent"], USER_AGENT);
});

test("a found product maps declared nutrients and never leaks nutrients_estimated", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(NUTELLA_PAYLOAD));
  const result = await lookupBarcode("3017620422003", { userAgent: USER_AGENT, fetchImpl, baseUrl: BASE_URL });
  assert.ok("nutrition" in result);
  if (!("nutrition" in result)) return;
  assert.deepEqual(result.nutrition.energyKcal, { present: true, value: 539 });
  assert.deepEqual(result.nutrition.proteinG, { present: true, value: 6.3 });
  assert.deepEqual(result.nutrition.fiberG, { present: false });
  assert.equal(result.name, "Nutella");
  assert.equal(result.brand, "Nutella, Ferrero, Yum yum");
  assert.deepEqual(result.rawAllergenTags, ["en:milk", "en:nuts", "en:soybeans"]);
  assert.equal(result.provenance.provider, "open-food-facts");
});

test("a product with declared fiber reports it as present", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse({ code: "20047559", product: YOGURT_PAYLOAD, status: 1, status_verbose: "product found" }));
  const result = await lookupBarcode("20047559", { userAgent: USER_AGENT, fetchImpl, baseUrl: BASE_URL });
  assert.ok("nutrition" in result);
  if (!("nutrition" in result)) return;
  assert.deepEqual(result.nutrition.fiberG, { present: true, value: 0.5 });
});

test("an unknown barcode resolves to found:false instead of throwing", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse({ code: "0000000000000", status: 0, status_verbose: "no code or invalid code" }));
  const result = await lookupBarcode("0000000000000", { userAgent: USER_AGENT, fetchImpl, baseUrl: BASE_URL });
  assert.deepEqual(result, { found: false, barcode: "0000000000000" });
});

test("a non-2xx response throws OpenFoodFactsError with code http-error", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse({}, 500));
  await assert.rejects(
    () => lookupBarcode("3017620422003", { userAgent: USER_AGENT, fetchImpl, baseUrl: BASE_URL }),
    (error: unknown) => error instanceof OpenFoodFactsError && error.code === "http-error" && error.httpStatus === 500,
  );
});

test("a 429 response throws OpenFoodFactsError with code rate-limited", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse({}, 429));
  await assert.rejects(
    () => lookupBarcode("3017620422003", { userAgent: USER_AGENT, fetchImpl, baseUrl: BASE_URL }),
    (error: unknown) => error instanceof OpenFoodFactsError && error.code === "rate-limited",
  );
});

test("a response whose body cannot be parsed as JSON throws code malformed-response", async () => {
  const fetchImpl: OffFetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error("boom"); } });
  await assert.rejects(
    () => lookupBarcode("3017620422003", { userAgent: USER_AGENT, fetchImpl, baseUrl: BASE_URL }),
    (error: unknown) => error instanceof OpenFoodFactsError && error.code === "malformed-response",
  );
});

test("a fetch rejection throws code network-error", async () => {
  const fetchImpl: OffFetch = async () => { throw new Error("offline"); };
  await assert.rejects(
    () => lookupBarcode("3017620422003", { userAgent: USER_AGENT, fetchImpl, baseUrl: BASE_URL }),
    (error: unknown) => error instanceof OpenFoodFactsError && error.code === "network-error",
  );
});

test("search builds the correct URL and parses each product through the shared parser", async () => {
  let capturedUrl = "";
  const fetchImpl = fakeFetch((url) => {
    capturedUrl = url;
    return jsonResponse({ count: 34011, page: 1, page_count: 1701, page_size: 2, products: [YOGURT_PAYLOAD, YOGURT_PAYLOAD] });
  });
  const result = await searchProducts("yogurt", { userAgent: USER_AGENT, fetchImpl, baseUrl: BASE_URL }, { pageSize: 2 });
  assert.equal(capturedUrl, `${BASE_URL}/cgi/search.pl?search_terms=yogurt&json=1&page_size=2&fields=code,product_name,brands,quantity,nutriments,allergens_tags,categories_tags,nutrition_data_per`);
  assert.equal(result.count, 34011);
  assert.equal(result.products.length, 2);
  assert.deepEqual(result.products[0]?.nutrition.fiberG, { present: true, value: 0.5 });
});

test("search with zero results returns an empty product list", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse({ count: 0, page: 1, page_count: 0, page_size: 20, products: [] }));
  const result = await searchProducts("xyzxyzxyz-does-not-exist", { userAgent: USER_AGENT, fetchImpl, baseUrl: BASE_URL });
  assert.deepEqual(result, { count: 0, products: [] });
});
