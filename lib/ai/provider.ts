import { parseArvenChatReply, parseWeeklyInsight, type ArvenChatReply, type WeeklyInsight } from "@/lib/ai/contracts";
import type { WeeklyMetricsV1 } from "@/lib/nutrition/weekly-metrics";

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

export type ArvenAiProvider = {
  generateChatReply: (request: ArvenChatRequest) => Promise<ArvenChatReply>;
  generateWeeklyInsight: (request: { systemPrompt: string; metrics: WeeklyMetricsV1 }) => Promise<WeeklyInsight>;
};

export type OpenAiClientConfig = {
  apiKey: string;
  model: string;
  fetchImpl: AiFetch;
  baseUrl?: string;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function performJsonCompletion(config: OpenAiClientConfig, messages: ChatMessage[]): Promise<unknown> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/chat/completions`;
  let response: AiFetchResponse;
  try {
    response = await config.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages, response_format: { type: "json_object" }, temperature: 0.4 }),
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
  try {
    return await response.json();
  } catch (error) {
    throw new AiProviderError("malformed-response", error instanceof Error ? error.message : "OpenAI response was not valid JSON");
  }
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
  const body = await performJsonCompletion(config, messages);
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
  const body = await performJsonCompletion(config, messages);
  const parsedJson = parseJsonContent(extractMessageContent(body));
  try {
    return parseWeeklyInsight(parsedJson);
  } catch (error) {
    throw new AiProviderError("invalid-reply", error instanceof Error ? error.message : "OpenAI weekly insight failed contract validation");
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
