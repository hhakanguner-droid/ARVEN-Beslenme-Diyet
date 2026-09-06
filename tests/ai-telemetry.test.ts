import assert from "node:assert/strict";
import test from "node:test";
import { dedupeInFlight, getAiUsageSummary, recordAiUsage, resetAiUsageForTests } from "@/lib/ai/telemetry";
import { generateChatReply, type AiFetchResponse } from "@/lib/ai/provider";

test("recordAiUsage/getAiUsageSummary aggregates token counts and an approximate cost per endpoint", () => {
  resetAiUsageForTests();
  recordAiUsage({ endpoint: "chat-reply", model: "gpt-4o-mini", promptTokens: 1000, completionTokens: 500 });
  recordAiUsage({ endpoint: "chat-reply", model: "gpt-4o-mini", promptTokens: 200, completionTokens: 100 });
  recordAiUsage({ endpoint: "meal-photo", model: "gpt-4o-mini", promptTokens: 300, completionTokens: 50 });

  const summary = getAiUsageSummary();
  assert.equal(summary.callCount, 3);
  assert.equal(summary.totalPromptTokens, 1500);
  assert.equal(summary.totalCompletionTokens, 650);
  assert.ok(summary.approxCostUsd > 0, "a positive cost estimate must be produced once tokens are recorded");
  assert.equal(summary.byEndpoint["chat-reply"]?.callCount, 2);
  assert.equal(summary.byEndpoint["meal-photo"]?.callCount, 1);
});

test("dedupeInFlight collapses concurrent calls sharing a key into a single execution of the factory", async () => {
  let callCount = 0;
  const factory = async () => { callCount += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return callCount; };

  const [a, b, c] = await Promise.all([
    dedupeInFlight("same-key", factory),
    dedupeInFlight("same-key", factory),
    dedupeInFlight("same-key", factory),
  ]);

  assert.equal(callCount, 1, "three concurrent calls with the same key must only run the factory once");
  assert.equal(a, b);
  assert.equal(b, c);

  // Once the first call has settled, a later call with the same key must run again (never a stale cache).
  const d = await dedupeInFlight("same-key", factory);
  assert.equal(callCount, 2);
  assert.equal(d, 2);
});

test("dedupeInFlight does not collapse calls with different keys", async () => {
  let callCount = 0;
  const factory = async () => { callCount += 1; return callCount; };
  await Promise.all([dedupeInFlight("key-1", factory), dedupeInFlight("key-2", factory)]);
  assert.equal(callCount, 2);
});

test("generateChatReply records token usage from the provider response and reuses one in-flight call for two identical concurrent requests", async () => {
  resetAiUsageForTests();
  let fetchCallCount = 0;
  const fetchImpl = async (): Promise<AiFetchResponse> => {
    fetchCallCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ schemaVersion: "ArvenChatReplyV1", reply: "Merhaba!", uncertainty: [] }) } }],
        usage: { prompt_tokens: 42, completion_tokens: 7 },
      }),
    };
  };
  const config = { apiKey: "test-key", model: "gpt-4o-mini", fetchImpl };
  const request = { systemPrompt: "Sen ARVEN'sin.", history: [], userMessage: "Selam" };

  const [first, second] = await Promise.all([generateChatReply(config, request), generateChatReply(config, request)]);

  assert.equal(fetchCallCount, 1, "two identical concurrent chat requests must only reach the network once");
  assert.equal(first.reply, "Merhaba!");
  assert.equal(second.reply, "Merhaba!");

  const summary = getAiUsageSummary();
  assert.equal(summary.byEndpoint["chat-reply"]?.callCount, 1);
  assert.equal(summary.totalPromptTokens, 42);
  assert.equal(summary.totalCompletionTokens, 7);
});
