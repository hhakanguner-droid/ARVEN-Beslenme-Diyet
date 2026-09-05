import assert from "node:assert/strict";
import test from "node:test";
import {
  AiProviderError,
  generateChatReply,
  generateWeeklyInsight,
  type AiFetch,
  type AiFetchResponse,
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
