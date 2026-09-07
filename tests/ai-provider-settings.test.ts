import assert from "node:assert/strict";
import test from "node:test";
import { V1MutationService } from "@/lib/persistence/v1-boundary";
import { isEncryptedCredential } from "@/lib/persistence/credential-crypto";
import { MemoryRunner } from "./fixtures/memory-transaction";

/**
 * Post-Faz-9 addition: lets the authenticated user paste their own AI provider API key into the
 * app itself (Ayarlar → Yapay Zeka). The one property every test here defends is that the raw key
 * never comes back out of `setAiProviderApiKey`/`getAiProviderKeyStatus` — only a boolean plus a
 * last-4-characters hint — while `getAiProviderApiKeyForRuntime` (the internal, non-HTTP-facing
 * method the AI-calling routes use) still returns the real value.
 *
 * BYOK hardening (fix/byok-security-hardening): every test in this file needs an encryption secret
 * configured, since `setAiProviderApiKey` now fails closed without one (see credential-crypto.ts).
 * `test.before`/`test.after` set and restore `ARVEN_CREDENTIAL_ENCRYPTION_KEY` around the whole
 * file; the fail-closed behavior itself, and the legacy-plaintext-migration path, get their own
 * dedicated tests below that deliberately unset/seed around that shared value.
 */
const ENCRYPTION_ENV_VAR = "ARVEN_CREDENTIAL_ENCRYPTION_KEY";
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
let previousEncryptionEnvValue: string | undefined;

test.before(() => {
  previousEncryptionEnvValue = process.env[ENCRYPTION_ENV_VAR];
  process.env[ENCRYPTION_ENV_VAR] = TEST_ENCRYPTION_KEY;
});
test.after(() => {
  if (previousEncryptionEnvValue === undefined) delete process.env[ENCRYPTION_ENV_VAR];
  else process.env[ENCRYPTION_ENV_VAR] = previousEncryptionEnvValue;
});

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

// --- BYOK hardening (fix/byok-security-hardening): encryption-at-rest regressions -----------------

test("a newly saved key is never stored as plaintext in persistence", async () => {
  const r = new MemoryRunner();
  const s = new V1MutationService("ai-key-encrypted-at-rest", r);
  const rawKey = "sk-must-never-appear-in-storage";
  await s.setAiProviderApiKey({ apiKey: rawKey });

  const stored = r.tx.aiProviderSettings.get("ai-key-encrypted-at-rest");
  assert.ok(stored, "expected a row to exist after saving");
  assert.equal(stored!.apiKey.includes(rawKey), false, "the stored value must not contain the raw key as a substring");
  assert.notEqual(stored!.apiKey, rawKey, "the stored value must not equal the raw key");
  assert.ok(isEncryptedCredential(stored!.apiKey), "a freshly saved key must be stored in the encrypted envelope format");

  // And the runtime/status paths must still recover the exact original value from that encrypted form.
  assert.equal(await s.getAiProviderApiKeyForRuntime(), rawKey);
  assert.equal((await s.getAiProviderKeyStatus()).maskedHint, rawKey.slice(-4));
});

test("setAiProviderApiKey fails closed (rejects, never falls back to plaintext) when no encryption secret is configured", async () => {
  const original = process.env[ENCRYPTION_ENV_VAR];
  delete process.env[ENCRYPTION_ENV_VAR];
  try {
    const r = new MemoryRunner();
    const s = new V1MutationService("ai-key-no-secret-configured", r);
    await assert.rejects(() => s.setAiProviderApiKey({ apiKey: "sk-should-never-be-saved" }));
    assert.equal(r.tx.aiProviderSettings.has("ai-key-no-secret-configured"), false, "a failed, fail-closed save must leave no row behind at all — never a plaintext one");
  } finally {
    if (original === undefined) delete process.env[ENCRYPTION_ENV_VAR];
    else process.env[ENCRYPTION_ENV_VAR] = original;
  }
});

test("a legacy pre-hardening plaintext row still works, and is transparently migrated to encrypted form on first runtime read", async () => {
  const r = new MemoryRunner();
  const s = new V1MutationService("ai-key-legacy-migration", r);
  // Simulate a row saved by PR #19's original, pre-encryption code: a bare plaintext value with no
  // envelope prefix at all, written directly into persistence (bypassing setAiProviderApiKey, which
  // would encrypt it).
  r.tx.aiProviderSettings.set("ai-key-legacy-migration", { apiKey: "sk-legacy-plaintext-value", updatedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(isEncryptedCredential(r.tx.aiProviderSettings.get("ai-key-legacy-migration")!.apiKey), false, "sanity check: the seeded row really is legacy plaintext");

  // The legacy value must still be usable exactly as before.
  assert.equal(await s.getAiProviderApiKeyForRuntime(), "sk-legacy-plaintext-value");

  // ...and must now have been migrated to the encrypted envelope in place, silently, as a side effect of that read.
  const afterFirstRead = r.tx.aiProviderSettings.get("ai-key-legacy-migration")!;
  assert.ok(isEncryptedCredential(afterFirstRead.apiKey), "the legacy row must be re-encrypted the first time it's read");
  assert.equal(afterFirstRead.apiKey.includes("sk-legacy-plaintext-value"), false, "the migrated row must not contain the plaintext as a substring");

  // And still correct, and still masked correctly, after migration.
  assert.equal(await s.getAiProviderApiKeyForRuntime(), "sk-legacy-plaintext-value");
  assert.equal((await s.getAiProviderKeyStatus()).maskedHint, "alue");
});

test("a legacy plaintext row is never lost when no encryption secret is configured yet — it just stays usable, unmigrated", async () => {
  const original = process.env[ENCRYPTION_ENV_VAR];
  delete process.env[ENCRYPTION_ENV_VAR];
  try {
    const r = new MemoryRunner();
    const s = new V1MutationService("ai-key-legacy-no-secret", r);
    r.tx.aiProviderSettings.set("ai-key-legacy-no-secret", { apiKey: "sk-legacy-still-works", updatedAt: "2026-09-01T00:00:00.000Z" });

    assert.equal(await s.getAiProviderApiKeyForRuntime(), "sk-legacy-still-works", "a legacy row must never silently become unreadable just because no encryption secret is configured yet");
    assert.equal(r.tx.aiProviderSettings.get("ai-key-legacy-no-secret")!.apiKey, "sk-legacy-still-works", "without a secret, the row is left exactly as-is rather than being lost or corrupted mid-migration");
  } finally {
    if (original === undefined) delete process.env[ENCRYPTION_ENV_VAR];
    else process.env[ENCRYPTION_ENV_VAR] = original;
  }
});
