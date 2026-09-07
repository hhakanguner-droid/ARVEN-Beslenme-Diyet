import assert from "node:assert/strict";
import test from "node:test";
import { V1MutationService } from "@/lib/persistence/v1-boundary";
import { MemoryRunner } from "./fixtures/memory-transaction";

/**
 * Post-Faz-9 addition: lets the authenticated user paste their own AI provider API key into the
 * app itself (Ayarlar → Yapay Zeka). The one property every test here defends is that the raw key
 * never comes back out of `setAiProviderApiKey`/`getAiProviderKeyStatus` — only a boolean plus a
 * last-4-characters hint — while `getAiProviderApiKeyForRuntime` (the internal, non-HTTP-facing
 * method the AI-calling routes use) still returns the real value.
 */

test("no key saved yet: status reports hasKey:false and the runtime lookup returns null", async () => {
  const r = new MemoryRunner();
  const s = new V1MutationService("ai-key-none", r);
  assert.deepEqual(await s.getAiProviderKeyStatus(), { hasKey: false, updatedAt: null, maskedHint: null });
  assert.equal(await s.getAiProviderApiKeyForRuntime(), null);
});

test("saving a key never returns the raw value, only hasKey/updatedAt/a last-4 hint", async () => {
  const r = new MemoryRunner();
  const s = new V1MutationService("ai-key-save", r, undefined, { now: () => new Date("2026-09-07T10:00:00Z") });
  const result = await s.setAiProviderApiKey({ apiKey: "sk-abcdEFGH1234" });
  assert.deepEqual(result, { hasKey: true, updatedAt: "2026-09-07T10:00:00.000Z", maskedHint: "1234" });
  assert.deepEqual(JSON.stringify(result).includes("sk-abcdEFGH1234"), false, "the full key must never appear in what this method returns");

  const status = await s.getAiProviderKeyStatus();
  assert.deepEqual(status, { hasKey: true, updatedAt: "2026-09-07T10:00:00.000Z", maskedHint: "1234" });

  // The internal, non-HTTP-facing lookup is the only place the raw value ever comes back.
  assert.equal(await s.getAiProviderApiKeyForRuntime(), "sk-abcdEFGH1234");
});

test("saving again overwrites the previous key (no duplicate rows, single-key-per-user)", async () => {
  const r = new MemoryRunner();
  const s = new V1MutationService("ai-key-overwrite", r, undefined, { now: () => new Date("2026-09-07T10:00:00Z") });
  await s.setAiProviderApiKey({ apiKey: "sk-first-key-value" });
  const second = await s.setAiProviderApiKey({ apiKey: "sk-second-key-value" });
  assert.equal(second.maskedHint, "alue");
  assert.equal(await s.getAiProviderApiKeyForRuntime(), "sk-second-key-value");
});

test("rejects an empty or too-short key rather than silently accepting it", async () => {
  const r = new MemoryRunner();
  const s = new V1MutationService("ai-key-invalid", r);
  await assert.rejects(() => s.setAiProviderApiKey({ apiKey: "" }));
  await assert.rejects(() => s.setAiProviderApiKey({ apiKey: "short" }));
  await assert.rejects(() => s.setAiProviderApiKey({ apiKey: 12345 }));
});

test("clearing a saved key removes it and falls back to no-key state", async () => {
  const r = new MemoryRunner();
  const s = new V1MutationService("ai-key-clear", r);
  await s.setAiProviderApiKey({ apiKey: "sk-to-be-cleared" });
  assert.equal((await s.getAiProviderKeyStatus()).hasKey, true);
  await s.clearAiProviderApiKey();
  assert.deepEqual(await s.getAiProviderKeyStatus(), { hasKey: false, updatedAt: null, maskedHint: null });
  assert.equal(await s.getAiProviderApiKeyForRuntime(), null);
});

test("a saved key is scoped to its own subject and does not leak across users", async () => {
  const r = new MemoryRunner();
  const s1 = new V1MutationService("ai-key-user-1", r);
  const s2 = new V1MutationService("ai-key-user-2", r);
  await s1.setAiProviderApiKey({ apiKey: "sk-user-one-key" });
  assert.equal((await s2.getAiProviderKeyStatus()).hasKey, false);
  assert.equal(await s2.getAiProviderApiKeyForRuntime(), null);
  assert.equal(await s1.getAiProviderApiKeyForRuntime(), "sk-user-one-key");
});

test("purgeAuthenticatedUser also removes a saved AI provider key", async () => {
  const r = new MemoryRunner();
  const s = new V1MutationService("ai-key-purge", r);
  await s.setAiProviderApiKey({ apiKey: "sk-purge-me-please" });
  await s.deleteAccount();
  assert.equal(r.tx.aiProviderSettings.has("ai-key-purge"), false, "the row must not survive account deletion, matching every other owned table");
});
