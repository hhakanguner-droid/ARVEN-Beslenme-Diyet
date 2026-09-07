import assert from "node:assert/strict";
import test from "node:test";
import { dedupeInFlight, getAiUsageSummary, recordAiUsage, resetAiUsageForTests } from "@/lib/ai/telemetry";
import { generateChatReply, type AiFetchResponse, type OpenAiClientConfig } from "@/lib/ai/provider";

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

// --- BYOK hardening (fix/byok-security-hardening): P1 cross-user dedup isolation regressions ------

function chatConfigFor(subject: string, apiKey: string, fetchImpl: OpenAiClientConfig["fetchImpl"], usageScope: "byok" | "shared" = "byok"): OpenAiClientConfig {
  return { apiKey, model: "gpt-4o-mini", fetchImpl, subject, usageScope };
}

function replyEnvelope(authorizationHeaderSeen: string): AiFetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ schemaVersion: "ArvenChatReplyV1", reply: `cevap-icin:${authorizationHeaderSeen}`, uncertainty: [] }) } }],
    }),
  };
}

test("two different users' identical concurrent chat requests are never deduplicated onto one shared in-flight call", async () => {
  const seenAuthorizations: string[] = [];
  let fetchCallCount = 0;
  const fetchImpl: OpenAiClientConfig["fetchImpl"] = async (_url, init) => {
    fetchCallCount += 1;
    seenAuthorizations.push(init.headers.Authorization);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return replyEnvelope(init.headers.Authorization);
  };
  const request = { systemPrompt: "Sen ARVEN'sin.", history: [], userMessage: "Merhaba" };

  const [replyForUserA, replyForUserB] = await Promise.all([
    generateChatReply(chatConfigFor("user-a", "sk-user-a-own-key", fetchImpl), request),
    generateChatReply(chatConfigFor("user-b", "sk-user-b-own-key", fetchImpl), request),
  ]);

  assert.equal(fetchCallCount, 2, "two different authenticated users sending the byte-identical request at the same time must each reach the network — never share one in-flight request");
  assert.equal(replyForUserA.reply, "cevap-icin:Bearer sk-user-a-own-key", "user A's reply must have been generated using user A's own credential, not user B's");
  assert.equal(replyForUserB.reply, "cevap-icin:Bearer sk-user-b-own-key", "user B's reply must have been generated using user B's own credential, not user A's");
  assert.deepEqual(new Set(seenAuthorizations), new Set(["Bearer sk-user-a-own-key", "Bearer sk-user-b-own-key"]));
});

test("the same user's identical concurrent chat requests with the SAME saved credential still deduplicate (the original intent is preserved)", async () => {
  let fetchCallCount = 0;
  const fetchImpl: OpenAiClientConfig["fetchImpl"] = async (_url, init) => {
    fetchCallCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return replyEnvelope(init.headers.Authorization);
  };
  const request = { systemPrompt: "Sen ARVEN'sin.", history: [], userMessage: "Merhaba" };

  await Promise.all([
    generateChatReply(chatConfigFor("user-a", "sk-user-a-own-key", fetchImpl), request),
    generateChatReply(chatConfigFor("user-a", "sk-user-a-own-key", fetchImpl), request),
  ]);

  assert.equal(fetchCallCount, 1, "a double-tap by the same user with the same credential must still collapse into one network call, exactly like before this hardening pass");
});

test("the same user's identical concurrent chat requests with a DIFFERENT credential (key just rotated) are never deduplicated together", async () => {
  let fetchCallCount = 0;
  const fetchImpl: OpenAiClientConfig["fetchImpl"] = async (_url, init) => {
    fetchCallCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return replyEnvelope(init.headers.Authorization);
  };
  const request = { systemPrompt: "Sen ARVEN'sin.", history: [], userMessage: "Merhaba" };

  await Promise.all([
    generateChatReply(chatConfigFor("user-a", "sk-user-a-old-key", fetchImpl), request),
    generateChatReply(chatConfigFor("user-a", "sk-user-a-new-key", fetchImpl), request),
  ]);

  assert.equal(fetchCallCount, 2, "a request made under the old credential must never be silently served to a request now made under a newly rotated one");
});

// --- BYOK hardening: P2 per-user telemetry isolation regressions ----------------------------------

test("getAiUsageSummary scoped to a viewer shows only that viewer's own BYOK usage, plus the pooled shared-credential usage", () => {
  resetAiUsageForTests();
  recordAiUsage({ endpoint: "chat-reply", model: "gpt-4o-mini", promptTokens: 100, completionTokens: 10, scope: "byok", subject: "user-a" });
  recordAiUsage({ endpoint: "chat-reply", model: "gpt-4o-mini", promptTokens: 200, completionTokens: 20, scope: "byok", subject: "user-b" });
  recordAiUsage({ endpoint: "meal-photo", model: "gpt-4o-mini", promptTokens: 50, completionTokens: 5, scope: "shared", subject: null });

  const viewA = getAiUsageSummary("user-a");
  assert.equal(viewA.callCount, 2, "user A must see their own BYOK call plus the one pooled shared-credential call");
  assert.equal(viewA.totalPromptTokens, 150);
  assert.equal(viewA.byEndpoint["chat-reply"]?.callCount, 1, "user A must not see user B's BYOK call");

  const viewB = getAiUsageSummary("user-b");
  assert.equal(viewB.callCount, 2, "user B must see their own BYOK call plus the same pooled shared-credential call");
  assert.equal(viewB.totalPromptTokens, 250);
  assert.equal(viewB.byEndpoint["chat-reply"]?.callCount, 1, "user B must not see user A's BYOK call");

  const viewC = getAiUsageSummary("user-c");
  assert.equal(viewC.callCount, 1, "a third user with no BYOK calls of their own must see only the pooled shared-credential usage, never anyone else's BYOK calls");
  assert.equal(viewC.byEndpoint["chat-reply"], undefined);
});

test("generateChatReply attributes usage to the calling subject only when the call actually used that subject's own key (usageScope: byok)", async () => {
  resetAiUsageForTests();
  const fetchImpl: OpenAiClientConfig["fetchImpl"] = async () => ({
    ok: true, status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ schemaVersion: "ArvenChatReplyV1", reply: "ok", uncertainty: [] }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 1 },
    }),
  });
  const request = { systemPrompt: "s", history: [], userMessage: "m" };

  await generateChatReply({ apiKey: "sk-user-a-key", model: "gpt-4o-mini", fetchImpl, subject: "user-a", usageScope: "byok" }, request);
  await generateChatReply({ apiKey: "sk-shared-server-key", model: "gpt-4o-mini", fetchImpl, subject: "user-b", usageScope: "shared" }, request);

  assert.equal(getAiUsageSummary("user-a").callCount, 2, "user A sees their own BYOK call plus the pooled shared call made on user B's behalf");
  assert.equal(getAiUsageSummary("user-b").callCount, 1, "user B used the shared credential (not BYOK), so only the pooled shared call is visible to them — never user A's BYOK call");
});
