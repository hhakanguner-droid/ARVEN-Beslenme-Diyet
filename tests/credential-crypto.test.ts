import assert from "node:assert/strict";
import test from "node:test";
import {
  CredentialDecryptionError,
  CredentialEncryptionUnavailableError,
  decryptCredential,
  encryptCredential,
  fingerprintCredential,
  isEncryptedCredential,
} from "@/lib/persistence/credential-crypto";

const ENV_VAR = "ARVEN_CREDENTIAL_ENCRYPTION_KEY";
const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

/** Every test here owns ENV_VAR for its own duration and restores whatever was there before — this module-level env var is process-global, and other test files (ai-provider-settings.test.ts, portability.test.ts) also touch it. */
function withEncryptionKey<T>(key: string | undefined, run: () => T | Promise<T>): Promise<T> {
  const original = process.env[ENV_VAR];
  if (key === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = key;
  return Promise.resolve(run()).finally(() => {
    if (original === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = original;
  });
}

test("encryptCredential/decryptCredential round-trip returns the exact original plaintext", async () => {
  await withEncryptionKey(KEY_A, async () => {
    const encrypted = await encryptCredential("sk-round-trip-secret-value");
    assert.ok(isEncryptedCredential(encrypted), "encrypted output must be recognized as the encrypted envelope format");
    assert.equal(encrypted.includes("sk-round-trip-secret-value"), false, "ciphertext must not contain the plaintext");
    const decrypted = await decryptCredential(encrypted);
    assert.equal(decrypted, "sk-round-trip-secret-value");
  });
});

test("encryptCredential never produces the same ciphertext twice for the same plaintext (random nonce per call)", async () => {
  await withEncryptionKey(KEY_A, async () => {
    const first = await encryptCredential("sk-same-value");
    const second = await encryptCredential("sk-same-value");
    assert.notEqual(first, second, "reusing a nonce under the same key would break AES-GCM's guarantees");
    assert.equal(await decryptCredential(first), "sk-same-value");
    assert.equal(await decryptCredential(second), "sk-same-value");
  });
});

test("encryptCredential fails closed with CredentialEncryptionUnavailableError when no key is configured", async () => {
  await withEncryptionKey(undefined, async () => {
    await assert.rejects(() => encryptCredential("sk-anything"), CredentialEncryptionUnavailableError);
  });
});

test("encryptCredential fails closed when the configured key is not valid base64 or not 32 bytes", async () => {
  await withEncryptionKey("not-base64!!!", async () => {
    await assert.rejects(() => encryptCredential("sk-anything"), CredentialEncryptionUnavailableError);
  });
  await withEncryptionKey(Buffer.alloc(16, 1).toString("base64"), async () => {
    await assert.rejects(() => encryptCredential("sk-anything"), CredentialEncryptionUnavailableError);
  });
});

test("decryptCredential throws CredentialDecryptionError when the wrong key is used", async () => {
  const encrypted = await withEncryptionKey(KEY_A, () => encryptCredential("sk-wrong-key-test"));
  await withEncryptionKey(KEY_B, async () => {
    await assert.rejects(() => decryptCredential(encrypted), CredentialDecryptionError);
  });
});

test("decryptCredential throws CredentialDecryptionError when the ciphertext has been tampered with", async () => {
  const encrypted = await withEncryptionKey(KEY_A, () => encryptCredential("sk-tamper-test"));
  // Flip one base64 character in the ciphertext segment (after the "arvenenc:v1:<iv>:" prefix) to
  // simulate a bit-flip / tampering attack; AES-GCM's authentication tag must reject this.
  const lastChar = encrypted.at(-1);
  const flipped = lastChar === "A" ? "B" : "A";
  const tampered = `${encrypted.slice(0, -1)}${flipped}`;
  await withEncryptionKey(KEY_A, async () => {
    await assert.rejects(() => decryptCredential(tampered), CredentialDecryptionError);
  });
});

test("decryptCredential returns a legacy (pre-hardening) plaintext value unchanged, with no key required at all", async () => {
  await withEncryptionKey(undefined, async () => {
    assert.equal(isEncryptedCredential("sk-legacy-plaintext-row"), false);
    assert.equal(await decryptCredential("sk-legacy-plaintext-row"), "sk-legacy-plaintext-row");
  });
});

test("decryptCredential requires a configured key to decrypt an actually-encrypted value, even though legacy plaintext needs none", async () => {
  const encrypted = await withEncryptionKey(KEY_A, () => encryptCredential("sk-needs-key"));
  await withEncryptionKey(undefined, async () => {
    await assert.rejects(() => decryptCredential(encrypted), CredentialEncryptionUnavailableError);
  });
});

test("fingerprintCredential is deterministic, non-reversible-looking, and distinguishes different credentials", async () => {
  const fingerprintA1 = await fingerprintCredential("sk-user-a-key");
  const fingerprintA2 = await fingerprintCredential("sk-user-a-key");
  const fingerprintB = await fingerprintCredential("sk-user-b-key");
  assert.equal(fingerprintA1, fingerprintA2, "the same credential must always fingerprint the same way, so dedup can still collapse identical repeats");
  assert.notEqual(fingerprintA1, fingerprintB, "different credentials must never collide onto the same fingerprint");
  assert.equal(fingerprintA1.includes("sk-user-a-key"), false, "the fingerprint must never contain the raw credential");
});
