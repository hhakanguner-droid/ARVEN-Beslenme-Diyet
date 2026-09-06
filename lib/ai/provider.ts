import {
  parseArvenChatReply, parseLabResultExtraction, parseMealPhotoEstimate, parseMenuAnalysis, parseProductPhotoIdentification, parseWeeklyInsight,
  type ArvenChatReply, type LabResultExtraction, type MealPhotoEstimate, type MenuAnalysis, type ProductPhotoIdentification, type WeeklyInsight,
} from "@/lib/ai/contracts";
import type { WeeklyMetricsV1 } from "@/lib/nutrition/weekly-metrics";
import { dedupeInFlight, recordAiUsage } from "@/lib/ai/telemetry";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

// Kept in Turkish because it is sent verbatim to the model as part of the system prompt, not
// shown to the end user — the model itself must understand the required output shape.
const RESPONSE_SCHEMA_HINT =
  "Yanıtını YALNIZCA şu alanları içeren tek bir JSON nesnesi olarak ver, başka hiçbir metin, açıklama " +
  "veya kod bloğu işareti ekleme: " +
  '{"schemaVersion":"ArvenChatReplyV1","reply":"kullanıcıya gösterilecek metin",' +
  '"mealSuggestion"?:{"schemaVersion":"MealSuggestionV1","title":"...","rationale":"...",' +
  '"ingredients":[{"foodQuery":"...","portionHint":{"measure":"piece|slice|teaspoon|tablespoon|tea-glass|water-glass|cup|bowl|handful|palm|serving|package|bottle|can|ladle","quantity":sayı,"size"?:"small|medium|large","naturalLabel":"..."}}],' +
  '"preparation":["..."],"uncertainty":["..."]},' +
  '"proposedWaterAction"?:{"kind":"water-log","milliliters":sayı},' +
  '"memoryUpdates"?:[{"factText":"...","provenance":"user-stated|ai-inferred","confidence":"high|medium|low"}],' +
  '"uncertainty":["..."]}. ' +
  "reply ve diğer tüm metin alanlarında sayı, yüzde veya besin/kalori/kilo miktarı ASLA belirtme; " +
  "kesin sayısal değerler yalnızca uygulamanın kendi hesaplamalarından gelir.";

const WEEKLY_INSIGHT_SCHEMA_HINT =
  "Yanıtını YALNIZCA şu alanları içeren tek bir JSON nesnesi olarak ver, başka hiçbir metin, açıklama " +
  "veya kod bloğu işareti ekleme: " +
  '{"schemaVersion":"WeeklyInsightV1","summary":"...","positives":["..."],' +
  '"areasForImprovement":["..."],"suggestions":["..."],"uncertainty":["..."]}. ' +
  "Sana verilen haftalık sayısal veriler yalnızca senin yorum yapman için bir bağlamdır; " +
  "bu sayıları veya başka herhangi bir sayıyı, yüzdeyi ya da miktarı yanıtının hiçbir metin alanında " +
  "tekrar ETME — yalnızca genel eğilim ve gözlemlerden nitel olarak bahset. " +
  "Asla tıbbi teşhis koyma veya tedavi önerme.";

const MEAL_PHOTO_SCHEMA_HINT =
  "Sana bir yemek fotoğrafı gösterilecek. Yanıtını YALNIZCA şu alanları içeren tek bir JSON nesnesi olarak ver, " +
  "başka hiçbir metin, açıklama veya kod bloğu işareti ekleme: " +
  '{"schemaVersion":"MealPhotoEstimateV1","items":[{"foodQuery":"...",' +
  '"portionHint":{"measure":"piece|slice|teaspoon|tablespoon|tea-glass|water-glass|cup|bowl|handful|palm|serving|package|bottle|can|ladle","quantity":sayı,"size"?:"small|medium|large","naturalLabel":"..."},' +
  '"confidence":"high|medium|low"}],"overallConfidence":"high|medium|low","uncertainty":["..."]}. ' +
  "Fotoğrafta gördüğün her ayrı besini ayrı bir öğe olarak listele. Hiçbir metin alanında sayı, yüzde veya " +
  "besin/kalori/kilo miktarı belirtme — yalnızca doğal porsiyon ifadeleri (ör. '1 avuç', '1 dilim') kullan; " +
  "kesin gram/kalori değerleri uygulamanın kendi verilen kataloğunfan gelecek. Emin olamadığın kısımları " +
  "uncertainty alanında belirt.";

const MENU_PHOTO_SCHEMA_HINT =
  "Sana bir restoran menüsü fotoğrafı gösterilecek. Yanıtını YALNIZCA şu alanları içeren tek bir JSON nesnesi " +
  "olarak ver, başka hiçbir metin, açıklama veya kod bloğu işareti ekleme: " +
  '{"schemaVersion":"MenuAnalysisV1","rankedItems":[{"itemName":"...","rationale":"...",' +
  '"fitsGoal"?:"good-fit|moderate-fit|less-fit"}],"uncertainty":["..."]}. ' +
  "Menüdeki seçenekleri, kullanıcının hedefine ve kısıtlarına (varsa alerji/beslenme tercihi) göre en uygundan " +
  "en az uyguna doğru sırala. rationale alanında ASLA sayı, yüzde veya kalori/besin miktarı belirtme, yalnızca " +
  "nitel bir gerekçe ver. Alerjen veya kısıt çakışması varsa bunu rationale içinde açıkça belirt.";

const PRODUCT_PHOTO_SCHEMA_HINT =
  "Sana bir ürün ambalajı veya etiketi fotoğrafı gösterilecek. Yanıtını YALNIZCA şu alanları içeren tek bir JSON " +
  "nesnesi olarak ver, başka hiçbir metin, açıklama veya kod bloğu işareti ekleme: " +
  '{"schemaVersion":"ProductPhotoIdentificationV1","candidateProductName":"..."|null,"candidateBrand":"..."|null,' +
  '"detectedBarcode":"..."|null,"confidence":"high|medium|low","uncertainty":["..."]}. ' +
  "detectedBarcode yalnızca fotoğrafta net okunabilen 6-14 haneli bir barkod numarasıysa doldurulmalı, aksi halde " +
  "null bırak. Bu alanlar yalnızca uygulamanın kendi doğrulanmış ürün kataloğunda arama yapmak için birer aday " +
  "önerisidir — kesin besin değerlerini SEN üretme.";

const LAB_RESULT_SCHEMA_HINT =
  "Sana bir laboratuvar tahlil sonucu fotoğrafı gösterilecek. Yanıtını YALNIZCA şu alanları içeren tek bir JSON " +
  "nesnesi olarak ver, başka hiçbir metin, açıklama veya kod bloğu işareti ekleme: " +
  '{"schemaVersion":"LabResultExtractionV1","entries":[{"markerName":"...","valueText":"...",' +
  '"unitText":"..."|null,"referenceRangeText":"..."|null}],"uncertainty":["..."]}. ' +
  "Fotoğrafta gördüğün her tahlil kalemini (ör. Glukoz, HbA1c, TSH) ayrı bir öğe olarak, gördüğün gibi " +
  "harfiyen aktar — değerini, birimini ve varsa referans aralığını olduğu gibi yaz, YORUMLAMA veya YUVARLAMA. " +
  "Hiçbir alanda tanı koyma, hastalık ismi söyleme veya tedavi/ilaç önerisi verme; yalnızca fotoğrafta " +
  "yazılanı transkript et. Net okuyamadığın veya emin olamadığın kısımları uncertainty alanında belirt.";

export type AiFetchResponse = { ok: boolean; status: number; json(): Promise<unknown> };
export type AiFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<AiFetchResponse>;

export type AiProviderErrorCode = "network-error" | "http-error" | "rate-limited" | "malformed-response" | "invalid-reply";

export class AiProviderError extends Error {
  constructor(readonly code: AiProviderErrorCode, message: string, readonly httpStatus?: number) {
    super(message);
    this.name = "AiProviderError";
  }
}

export type ArvenChatTurn = { role: "user" | "assistant"; content: string };

export type ArvenChatRequest = {
  /** Deterministic Turkish system prompt built by lib/ai/context-engine.ts. */
  systemPrompt: string;
  /** Prior turns in the conversation, oldest first. Kept short by the caller. */
  history: ArvenChatTurn[];
  userMessage: string;
};

/** A photo-analysis request: a system prompt plus one base64-encoded image the model can look at. */
export type ArvenPhotoRequest = {
  systemPrompt: string;
  imageBase64: string;
  mimeType: string;
};

export type ArvenAiProvider = {
  generateChatReply: (request: ArvenChatRequest) => Promise<ArvenChatReply>;
  generateWeeklyInsight: (request: { systemPrompt: string; metrics: WeeklyMetricsV1 }) => Promise<WeeklyInsight>;
  analyzeMealPhoto: (request: ArvenPhotoRequest) => Promise<MealPhotoEstimate>;
  analyzeMenuPhoto: (request: ArvenPhotoRequest) => Promise<MenuAnalysis>;
  identifyProductPhoto: (request: ArvenPhotoRequest) => Promise<ProductPhotoIdentification>;
  extractLabResult: (request: ArvenPhotoRequest) => Promise<LabResultExtraction>;
};

export type OpenAiClientConfig = {
  apiKey: string;
  model: string;
  fetchImpl: AiFetch;
  baseUrl?: string;
};

type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ChatContentPart[] };

/** OpenAI's own chat-completions token-usage block, when the API includes it. */
type OpenAiUsage = { prompt_tokens?: number; completion_tokens?: number };

/**
 * Faz 9 hardening: every one of this module's six call sites goes through here, so this single
 * choke point is where cost telemetry (`lib/ai/telemetry.ts`) and request deduplication both live —
 * neither needed touching each of the six functions below individually. Deduplication is keyed on
 * the exact request body (model + messages), so it only ever collapses genuinely identical
 * concurrent calls (e.g. a double-tap send before the first reply arrives), never two different
 * users' or two different turns' requests.
 */
async function performJsonCompletion(config: OpenAiClientConfig, messages: ChatMessage[], endpoint: string): Promise<unknown> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/chat/completions`;
  const requestBody = JSON.stringify({ model: config.model, messages, response_format: { type: "json_object" }, temperature: 0.4 });
  const dedupeKey = `${url}:${requestBody}`;

  return dedupeInFlight(dedupeKey, async () => {
    let response: AiFetchResponse;
    try {
      response = await config.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: requestBody,
      });
    } catch (error) {
      throw new AiProviderError("network-error", error instanceof Error ? error.message : "OpenAI request failed");
    }
    if (response.status === 429) {
      throw new AiProviderError("rate-limited", "OpenAI rate limit exceeded", response.status);
    }
    if (!response.ok) {
      throw new AiProviderError("http-error", `OpenAI request failed with status ${response.status}`, response.status);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new AiProviderError("malformed-response", error instanceof Error ? error.message : "OpenAI response was not valid JSON");
    }
    const usage = (body as { usage?: OpenAiUsage } | null)?.usage;
    if (usage) {
      recordAiUsage({ endpoint, model: config.model, promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 });
    }
    return body;
  });
}

function extractMessageContent(body: unknown): string {
  if (!body || typeof body !== "object") {
    throw new AiProviderError("malformed-response", "OpenAI response payload was not an object");
  }
  const choices = (body as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AiProviderError("malformed-response", "OpenAI response had no choices");
  }
  const message = (choices[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiProviderError("malformed-response", "OpenAI response message had no text content");
  }
  return content;
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new AiProviderError("malformed-response", "OpenAI reply content was not valid JSON");
  }
}

/** Pure core — one OpenAI chat-completion round trip, validated against ArvenChatReplyV1. */
export async function generateChatReply(config: OpenAiClientConfig, request: ArvenChatRequest): Promise<ArvenChatReply> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${request.systemPrompt}\n\n${RESPONSE_SCHEMA_HINT}` },
    ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user", content: request.userMessage },
  ];
  const body = await performJsonCompletion(config, messages, "chat-reply");
  const parsedJson = parseJsonContent(extractMessageContent(body));
  try {
    return parseArvenChatReply(parsedJson);
  } catch (error) {
    throw new AiProviderError("invalid-reply", error instanceof Error ? error.message : "OpenAI reply failed contract validation");
  }
}

/**
 * Pure core — one OpenAI chat-completion round trip producing a narrative-only WeeklyInsightV1,
 * grounded in `metrics` (ARVEN's own deterministic weekly aggregate — see
 * lib/nutrition/weekly-metrics.ts). `weeklyNarrative`'s numeric-claim guard in lib/ai/contracts.ts
 * is what actually enforces that the model never echoes a number back; the prompt only asks nicely.
 */
export async function generateWeeklyInsight(
  config: OpenAiClientConfig,
  request: { systemPrompt: string; metrics: WeeklyMetricsV1 },
): Promise<WeeklyInsight> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${request.systemPrompt}\n\n${WEEKLY_INSIGHT_SCHEMA_HINT}` },
    { role: "user", content: `Bu haftanın sayısal verileri (yalnızca bağlam amaçlı, tekrar etme): ${JSON.stringify(request.metrics)}` },
  ];
  const body = await performJsonCompletion(config, messages, "weekly-insight");
  const parsedJson = parseJsonContent(extractMessageContent(body));
  try {
    return parseWeeklyInsight(parsedJson);
  } catch (error) {
    throw new AiProviderError("invalid-reply", error instanceof Error ? error.message : "OpenAI weekly insight failed contract validation");
  }
}

/** Builds the two-part user message (instruction text + the photo as a data: URL) shared by all three vision calls. */
function buildPhotoUserMessage(instruction: string, request: ArvenPhotoRequest): ChatMessage {
  return {
    role: "user",
    content: [
      { type: "text", text: instruction },
      { type: "image_url", image_url: { url: `data:${request.mimeType};base64,${request.imageBase64}` } },
    ],
  };
}

/** Pure core — one OpenAI vision chat-completion round trip, validated against MealPhotoEstimateV1. */
export async function analyzeMealPhoto(config: OpenAiClientConfig, request: ArvenPhotoRequest): Promise<MealPhotoEstimate> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${request.systemPrompt}\n\n${MEAL_PHOTO_SCHEMA_HINT}` },
    buildPhotoUserMessage("Ekteki yemek fotoğrafını incele ve gördüğün besinleri belirt.", request),
  ];
  const body = await performJsonCompletion(config, messages, "meal-photo");
  const parsedJson = parseJsonContent(extractMessageContent(body));
  try {
    return parseMealPhotoEstimate(parsedJson);
  } catch (error) {
    throw new AiProviderError("invalid-reply", error instanceof Error ? error.message : "OpenAI meal photo estimate failed contract validation");
  }
}

/** Pure core — one OpenAI vision chat-completion round trip, validated against MenuAnalysisV1. */
export async function analyzeMenuPhoto(config: OpenAiClientConfig, request: ArvenPhotoRequest): Promise<MenuAnalysis> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${request.systemPrompt}\n\n${MENU_PHOTO_SCHEMA_HINT}` },
    buildPhotoUserMessage("Ekteki restoran menüsü fotoğrafını incele ve seçenekleri sırala.", request),
  ];
  const body = await performJsonCompletion(config, messages, "menu-photo");
  const parsedJson = parseJsonContent(extractMessageContent(body));
  try {
    return parseMenuAnalysis(parsedJson);
  } catch (error) {
    throw new AiProviderError("invalid-reply", error instanceof Error ? error.message : "OpenAI menu analysis failed contract validation");
  }
}

/** Pure core — one OpenAI vision chat-completion round trip, validated against ProductPhotoIdentificationV1. */
export async function identifyProductPhoto(config: OpenAiClientConfig, request: ArvenPhotoRequest): Promise<ProductPhotoIdentification> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${request.systemPrompt}\n\n${PRODUCT_PHOTO_SCHEMA_HINT}` },
    buildPhotoUserMessage("Ekteki ürün fotoğrafını incele ve ürünü tanımaya çalış.", request),
  ];
  const body = await performJsonCompletion(config, messages, "product-photo");
  const parsedJson = parseJsonContent(extractMessageContent(body));
  try {
    return parseProductPhotoIdentification(parsedJson);
  } catch (error) {
    throw new AiProviderError("invalid-reply", error instanceof Error ? error.message : "OpenAI product photo identification failed contract validation");
  }
}

/**
 * Pure core — one OpenAI vision chat-completion round trip, validated against LabResultExtractionV1.
 * Unlike the other three vision functions above, the model's numbers here are exactly what the
 * caller wants (a transcription of the user's own lab report) — see LabResultExtractionV1's doc
 * comment in lib/ai/contracts.ts for why the usual no-numbers rule does not apply, and what does.
 */
export async function extractLabResult(config: OpenAiClientConfig, request: ArvenPhotoRequest): Promise<LabResultExtraction> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${request.systemPrompt}\n\n${LAB_RESULT_SCHEMA_HINT}` },
    buildPhotoUserMessage("Ekteki tahlil sonucu fotoğrafını incele ve gördüğün değerleri aktar.", request),
  ];
  const body = await performJsonCompletion(config, messages, "lab-result");
  const parsedJson = parseJsonContent(extractMessageContent(body));
  try {
    return parseLabResultExtraction(parsedJson);
  } catch (error) {
    throw new AiProviderError("invalid-reply", error instanceof Error ? error.message : "OpenAI lab result extraction failed contract validation");
  }
}

/** Production wrapper: uses the global `fetch` and an env-configured API key/model. Throws if unset. */
export function createOpenAiProvider(env?: { apiKey?: string; model?: string }): ArvenAiProvider {
  const apiKey = env?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("OPENAI_API_KEY must be configured to call the OpenAI provider");
  }
  const model = env?.model ?? process.env.ARVEN_AI_MODEL ?? DEFAULT_MODEL;
  const config: OpenAiClientConfig = { apiKey, model, fetchImpl: (url, init) => fetch(url, init) };
  return {
    generateChatReply: (request) => generateChatReply(config, request),
    generateWeeklyInsight: (request) => generateWeeklyInsight(config, request),
    analyzeMealPhoto: (request) => analyzeMealPhoto(config, request),
    analyzeMenuPhoto: (request) => analyzeMenuPhoto(config, request),
    identifyProductPhoto: (request) => identifyProductPhoto(config, request),
    extractLabResult: (request) => extractLabResult(config, request),
  };
}

/**
 * Same as `createOpenAiProvider`, but returns `null` instead of throwing when `OPENAI_API_KEY`
 * is not configured yet — mirrors `getOptionalOpenFoodFactsClient` from
 * lib/nutrition/providers/open-food-facts.ts. Lets every ARVEN AI route degrade gracefully
 * (informational-only response) until the user supplies a real key via Cloudflare secrets.
 */
export function getOptionalAiProvider(env?: { apiKey?: string; model?: string }): ArvenAiProvider | null {
  const apiKey = env?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;
  return createOpenAiProvider({ apiKey, model: env?.model });
}
