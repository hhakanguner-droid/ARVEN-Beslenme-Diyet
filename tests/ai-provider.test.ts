import assert from "node:assert/strict";
import test from "node:test";
import {
  AiProviderError,
  analyzeMealPhoto,
  analyzeMenuPhoto,
  extractLabResult,
  generateChatReply,
  generateWeeklyInsight,
  identifyProductPhoto,
  type AiFetch,
  type AiFetchResponse,
  type ArvenPhotoRequest,
  type OpenAiClientConfig,
} from "../lib/ai/provider";
import type { WeeklyMetricsV1 } from "../lib/nutrition/weekly-metrics";

const API_KEY = "test-key";
const MODEL = "gpt-4o-mini";

function fakeFetch(handler: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => AiFetchResponse): AiFetch {
  return async (url, init) => handler(url, init);
}

function jsonResponse(body: unknown, status = 200): AiFetchResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function chatCompletionEnvelope(content: unknown): unknown {
  return { choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] };
}

function config(fetchImpl: AiFetch): OpenAiClientConfig {
  return { apiKey: API_KEY, model: MODEL, fetchImpl, baseUrl: "https://ai.test" };
}

const validChatReplyJson = { schemaVersion: "ArvenChatReplyV1", reply: "Elbette, yardımcı olabilirim.", uncertainty: [] };

test("generateChatReply posts to the chat-completions endpoint with the model, key and JSON response format", async () => {
  const captured: { url: string; authorization: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = fakeFetch((url, init) => {
    captured.push({ url, authorization: init.headers.Authorization, body: JSON.parse(init.body) });
    return jsonResponse(chatCompletionEnvelope(validChatReplyJson));
  });
  const reply = await generateChatReply(config(fetchImpl), { systemPrompt: "Sistem", history: [], userMessage: "Merhaba" });
  assert.equal(captured[0]?.url, "https://ai.test/chat/completions");
  assert.equal(captured[0]?.authorization, `Bearer ${API_KEY}`);
  assert.equal(captured[0]?.body.model, MODEL);
  assert.equal((captured[0]?.body.response_format as { type: string }).type, "json_object");
  assert.equal(reply.reply, validChatReplyJson.reply);
});

test("generateChatReply includes prior turns and the new user message in order", async () => {
  let sentMessages: { role: string; content: string }[] = [];
  const fetchImpl = fakeFetch((_url, init) => {
    sentMessages = JSON.parse(init.body).messages;
    return jsonResponse(chatCompletionEnvelope(validChatReplyJson));
  });
  await generateChatReply(config(fetchImpl), {
    systemPrompt: "Sistem",
    history: [{ role: "user", content: "ilk mesaj" }, { role: "assistant", content: "ilk yanıt" }],
    userMessage: "ikinci mesaj",
  });
  assert.equal(sentMessages[0].role, "system");
  assert.deepEqual(sentMessages.slice(1).map((m) => [m.role, m.content]), [
    ["user", "ilk mesaj"],
    ["assistant", "ilk yanıt"],
    ["user", "ikinci mesaj"],
  ]);
});

test("generateChatReply throws invalid-reply when the model's JSON fails contract validation", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(chatCompletionEnvelope({ schemaVersion: "ArvenChatReplyV1", reply: "Bugün 1900 kcal aldın.", uncertainty: [] })));
  await assert.rejects(
    () => generateChatReply(config(fetchImpl), { systemPrompt: "Sistem", history: [], userMessage: "Merhaba" }),
    (error: unknown) => error instanceof AiProviderError && error.code === "invalid-reply",
  );
});

test("generateChatReply throws malformed-response when the model's content is not valid JSON", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(chatCompletionEnvelope("bu json değil")));
  await assert.rejects(
    () => generateChatReply(config(fetchImpl), { systemPrompt: "Sistem", history: [], userMessage: "Merhaba" }),
    (error: unknown) => error instanceof AiProviderError && error.code === "malformed-response",
  );
});

test("generateChatReply throws rate-limited on a 429 and http-error on other non-2xx statuses", async () => {
  await assert.rejects(
    () => generateChatReply(config(fakeFetch(() => jsonResponse({}, 429))), { systemPrompt: "s", history: [], userMessage: "m" }),
    (error: unknown) => error instanceof AiProviderError && error.code === "rate-limited",
  );
  await assert.rejects(
    () => generateChatReply(config(fakeFetch(() => jsonResponse({}, 500))), { systemPrompt: "s", history: [], userMessage: "m" }),
    (error: unknown) => error instanceof AiProviderError && error.code === "http-error",
  );
});

test("generateChatReply throws network-error when the fetch implementation itself rejects", async () => {
  const fetchImpl: AiFetch = async () => { throw new Error("boom"); };
  await assert.rejects(
    () => generateChatReply(config(fetchImpl), { systemPrompt: "s", history: [], userMessage: "m" }),
    (error: unknown) => error instanceof AiProviderError && error.code === "network-error",
  );
});

const sampleMetrics: WeeklyMetricsV1 = {
  schemaVersion: "WeeklyMetricsV1",
  weekStartLocalDate: "2026-08-31",
  weekEndLocalDate: "2026-09-06",
  hasGoal: true,
  daysWithLoggedFood: 5,
  averageEnergyKcal: 1900,
  averageProteinG: 110,
  averageCarbsG: 200,
  averageFatG: 60,
  averageWaterMl: 1800,
  daysWaterGoalMet: 4,
};

test("generateWeeklyInsight sends the deterministic metrics as context and validates the narrative-only reply", async () => {
  let sentMessages: { role: string; content: string }[] = [];
  const fetchImpl = fakeFetch((_url, init) => {
    sentMessages = JSON.parse(init.body).messages;
    return jsonResponse(chatCompletionEnvelope({
      schemaVersion: "WeeklyInsightV1",
      summary: "Bu hafta öğün kayıtlarında daha düzenli bir ritim oluştu.",
      positives: [], areasForImprovement: [], suggestions: [], uncertainty: [],
    }));
  });
  const insight = await generateWeeklyInsight(config(fetchImpl), { systemPrompt: "Sistem", metrics: sampleMetrics });
  assert.match(sentMessages[1].content, /2026-08-31/);
  assert.equal(insight.summary, "Bu hafta öğün kayıtlarında daha düzenli bir ritim oluştu.");
});

test("generateWeeklyInsight rejects a narrative that echoes back a number from the metrics", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(chatCompletionEnvelope({
    schemaVersion: "WeeklyInsightV1", summary: "Ortalaman 1900 kcal civarında.",
    positives: [], areasForImprovement: [], suggestions: [], uncertainty: [],
  })));
  await assert.rejects(
    () => generateWeeklyInsight(config(fetchImpl), { systemPrompt: "Sistem", metrics: sampleMetrics }),
    (error: unknown) => error instanceof AiProviderError && error.code === "invalid-reply",
  );
});

// Phase 5: vision provider functions. Each sends a two-part user message — an instruction string
// plus an `image_url` content part carrying the photo as a `data:` URL — and validates the model's
// JSON reply against the matching Phase 5 contract, exactly like generateWeeklyInsight above.

const photoRequest: ArvenPhotoRequest = { systemPrompt: "Sistem", imageBase64: "ZmFrZS1pbWFnZS1ieXRlcw==", mimeType: "image/jpeg" };

function lastUserMessage(sentMessages: { role: string; content: unknown }[]) {
  return sentMessages[sentMessages.length - 1] as { role: string; content: { type: string; text?: string; image_url?: { url: string } }[] };
}

test("analyzeMealPhoto sends the photo as a data: URL image_url part and validates the reply against MealPhotoEstimateV1", async () => {
  let sentMessages: { role: string; content: unknown }[] = [];
  const fetchImpl = fakeFetch((_url, init) => {
    sentMessages = JSON.parse(init.body).messages;
    return jsonResponse(chatCompletionEnvelope({
      schemaVersion: "MealPhotoEstimateV1",
      items: [{ foodQuery: "ızgara tavuk göğüssü", portionHint: { measure: "palm", quantity: 1, naturalLabel: "1 avuç içi" }, confidence: "medium" }],
      overallConfidence: "medium",
      uncertainty: [],
    }));
  });
  const estimate = await analyzeMealPhoto(config(fetchImpl), photoRequest);
  const userMessage = lastUserMessage(sentMessages);
  assert.equal(userMessage.role, "user");
  const imagePart = userMessage.content.find((part) => part.type === "image_url");
  assert.equal(imagePart?.image_url?.url, `data:${photoRequest.mimeType};base64,${photoRequest.imageBase64}`);
  assert.equal(estimate.items[0]?.foodQuery, "ızgara tavuk göğüssü");
});

test("analyzeMealPhoto throws invalid-reply when the model's JSON fails MealPhotoEstimateV1 validation", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(chatCompletionEnvelope({ schemaVersion: "MealPhotoEstimateV1", items: [], overallConfidence: "medium", uncertainty: [] })));
  await assert.rejects(
    () => analyzeMealPhoto(config(fetchImpl), photoRequest),
    (error: unknown) => error instanceof AiProviderError && error.code === "invalid-reply",
  );
});

test("analyzeMenuPhoto sends the photo as an image_url part and validates the reply against MenuAnalysisV1", async () => {
  let sentMessages: { role: string; content: unknown }[] = [];
  const fetchImpl = fakeFetch((_url, init) => {
    sentMessages = JSON.parse(init.body).messages;
    return jsonResponse(chatCompletionEnvelope({
      schemaVersion: "MenuAnalysisV1",
      rankedItems: [{ itemName: "Izgara somon", rationale: "Protein ağırlıklı bir seçenek.", fitsGoal: "good-fit" }],
      uncertainty: [],
    }));
  });
  const analysis = await analyzeMenuPhoto(config(fetchImpl), photoRequest);
  const imagePart = lastUserMessage(sentMessages).content.find((part) => part.type === "image_url");
  assert.equal(imagePart?.image_url?.url, `data:${photoRequest.mimeType};base64,${photoRequest.imageBase64}`);
  assert.equal(analysis.rankedItems[0]?.fitsGoal, "good-fit");
});

test("analyzeMenuPhoto throws invalid-reply when the model's JSON fails MenuAnalysisV1 validation", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(chatCompletionEnvelope({
    schemaVersion: "MenuAnalysisV1",
    rankedItems: [{ itemName: "Izgara somon", rationale: "Yaklaşık 450 kalori civarında." }],
    uncertainty: [],
  })));
  await assert.rejects(
    () => analyzeMenuPhoto(config(fetchImpl), photoRequest),
    (error: unknown) => error instanceof AiProviderError && error.code === "invalid-reply",
  );
});

test("identifyProductPhoto sends the photo as an image_url part and validates the reply against ProductPhotoIdentificationV1", async () => {
  let sentMessages: { role: string; content: unknown }[] = [];
  const fetchImpl = fakeFetch((_url, init) => {
    sentMessages = JSON.parse(init.body).messages;
    return jsonResponse(chatCompletionEnvelope({
      schemaVersion: "ProductPhotoIdentificationV1",
      candidateProductName: "yulaf ezmesi",
      candidateBrand: "Örnek Marka",
      detectedBarcode: "8690000000012",
      confidence: "high",
      uncertainty: [],
    }));
  });
  const identification = await identifyProductPhoto(config(fetchImpl), photoRequest);
  const imagePart = lastUserMessage(sentMessages).content.find((part) => part.type === "image_url");
  assert.equal(imagePart?.image_url?.url, `data:${photoRequest.mimeType};base64,${photoRequest.imageBase64}`);
  assert.equal(identification.detectedBarcode, "8690000000012");
});

test("identifyProductPhoto throws invalid-reply when the model's JSON fails ProductPhotoIdentificationV1 validation", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(chatCompletionEnvelope({
    schemaVersion: "ProductPhotoIdentificationV1",
    candidateProductName: "yulaf ezmesi",
    candidateBrand: "Örnek Marka",
    detectedBarcode: "12",
    confidence: "high",
    uncertainty: [],
  })));
  await assert.rejects(
    () => identifyProductPhoto(config(fetchImpl), photoRequest),
    (error: unknown) => error instanceof AiProviderError && error.code === "invalid-reply",
  );
});

test("extractLabResult sends the photo as an image_url part and validates the reply against LabResultExtractionV1, numbers and all", async () => {
  let sentMessages: { role: string; content: unknown }[] = [];
  const fetchImpl = fakeFetch((_url, init) => {
    sentMessages = JSON.parse(init.body).messages;
    return jsonResponse(chatCompletionEnvelope({
      schemaVersion: "LabResultExtractionV1",
      entries: [{ markerName: "Glukoz", valueText: "95", unitText: "mg/dL", referenceRangeText: "70-100" }],
      uncertainty: [],
    }));
  });
  const extraction = await extractLabResult(config(fetchImpl), photoRequest);
  const imagePart = lastUserMessage(sentMessages).content.find((part) => part.type === "image_url");
  assert.equal(imagePart?.image_url?.url, `data:${photoRequest.mimeType};base64,${photoRequest.imageBase64}`);
  assert.equal(extraction.entries[0]?.valueText, "95");
});

test("extractLabResult throws invalid-reply when the model's JSON fails LabResultExtractionV1 validation", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(chatCompletionEnvelope({ schemaVersion: "LabResultExtractionV1", entries: [], uncertainty: [] })));
  await assert.rejects(
    () => extractLabResult(config(fetchImpl), photoRequest),
    (error: unknown) => error instanceof AiProviderError && error.code === "invalid-reply",
  );
});

test("extractLabResult rejects a diagnostic assertion smuggled into a marker name", async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(chatCompletionEnvelope({
    schemaVersion: "LabResultExtractionV1",
    entries: [{ markerName: "Diyabetsin", valueText: "95", unitText: null, referenceRangeText: null }],
    uncertainty: [],
  })));
  await assert.rejects(
    () => extractLabResult(config(fetchImpl), photoRequest),
    (error: unknown) => error instanceof AiProviderError && error.code === "invalid-reply",
  );
});
