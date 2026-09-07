/**
 * BYOK hardening (fix/byok-security-hardening): application-level authenticated encryption for the
 * user's own AI provider API key (`ai_provider_settings.api_key`, see
 * `db/migrations/durable-object/0004_ai_provider_settings.ts`). PR #19 originally stored this value
 * as plaintext; this module is the only place that ever turns a raw key into what actually reaches
 * the database, and the only place that ever turns it back.
 *
 * Design, deliberately the simplest thing that satisfies "never plaintext at rest, fail closed
 * without a secret, upgrade-safe for already-merged plaintext rows":
 *  - AES-256-GCM (Web Crypto — `crypto.subtle`, available in both Node's test runtime and the
 *    Cloudflare Workers runtime; no new dependency).
 *  - A random 12-byte nonce per encryption (GCM must never reuse a nonce under the same key).
 *  - The whole encrypted form (version + nonce + ciphertext, ciphertext including GCM's auth tag)
 *    is packed into ONE self-describing string — `arvenenc:v1:<nonceB64>:<ciphertextB64>` — so it
 *    fits in the existing single `api_key TEXT` column with no schema/migration change at all, and
 *    `V1Transaction` implementations (real adapter, in-memory test fake) stay completely unaware
 *    that the string they're storing is encrypted; they just move an opaque string around, exactly
 *    as before.
 *  - A value that does NOT start with the `arvenenc:v1:` prefix is a legacy plaintext row from
 *    before this hardening pass. `decryptCredential` returns it as-is (no key needed to read an
 *    already-plaintext value — this is what keeps a pre-existing production row usable even before
 *    an operator has configured the encryption secret, per "sessiz credential kaybı oluşturma").
 *    `lib/persistence/v1-boundary.ts`'s `getAiProviderApiKeyForRuntime` opportunistically re-encrypts
 *    a legacy row the first time it's read, if a secret happens to be configured.
 *
 * The key itself: `ARVEN_CREDENTIAL_ENCRYPTION_KEY`, a base64-encoded 32-byte (256-bit) secret, read
 * from `process.env` — the same convention this codebase already uses for `OPENAI_API_KEY` (see
 * `lib/ai/provider.ts`). It must come from a Cloudflare secret in production, never be committed to
 * the repo, and never be stored in the database itself (a DB-stored KEK would defeat the point:
 * anyone who can read the credentials table could also read the key that unlocks it).
 */

const ENCRYPTED_PREFIX = "arvenenc:v1:";
const ENV_VAR_NAME = "ARVEN_CREDENTIAL_ENCRYPTION_KEY";
const KEY_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;

/** Thrown when `ARVEN_CREDENTIAL_ENCRYPTION_KEY` is missing or malformed. Callers must fail closed on this, never fall back to storing plaintext. */
export class CredentialEncryptionUnavailableError extends Error {
  constructor(message = `${ENV_VAR_NAME} is not configured; refusing to store an AI provider API key without at-rest encryption`) {
    super(message);
    this.name = "CredentialEncryptionUnavailableError";
  }
}

/** Thrown when a stored value claims to be encrypted (`arvenenc:v1:` prefix) but fails to decrypt — wrong key or tampered ciphertext. Never includes the offending value in its message. */
export class CredentialDecryptionError extends Error {
  constructor(message = "Stored AI provider API key could not be decrypted (wrong key or corrupted data)") {
    super(message);
    this.name = "CredentialDecryptionError";
  }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  // Deliberately copied into a freshly allocated Uint8Array (explicitly typed over a real
  // ArrayBuffer, never a SharedArrayBuffer) rather than returning Buffer.from(...) directly — Node's
  // Buffer type is typed as ArrayBufferLike-backed, which `crypto.subtle`'s stricter BufferSource
  // types reject.
  const decoded = Buffer.from(value, "base64");
  const copy = new Uint8Array(decoded.byteLength) as Uint8Array<ArrayBuffer>;
  copy.set(decoded);
  return copy;
}

let cachedKeyMaterial: { sourceValue: string; key: Promise<CryptoKey> } | null = null;

/** Loads and caches the AES-GCM `CryptoKey` derived from `ARVEN_CREDENTIAL_ENCRYPTION_KEY`. Re-derives if the env var value changes (relevant to tests that swap it between cases). */
function loadEncryptionKey(): Promise<CryptoKey> {
  const raw = process.env[ENV_VAR_NAME];
  if (!raw || !raw.trim()) throw new CredentialEncryptionUnavailableError();
  if (cachedKeyMaterial && cachedKeyMaterial.sourceValue === raw) return cachedKeyMaterial.key;

  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = fromBase64(raw.trim());
  } catch {
    throw new CredentialEncryptionUnavailableError(`${ENV_VAR_NAME} is not valid base64`);
  }
  if (keyBytes.length !== KEY_BYTE_LENGTH) {
    throw new CredentialEncryptionUnavailableError(`${ENV_VAR_NAME} must decode to exactly ${KEY_BYTE_LENGTH} bytes (a base64-encoded AES-256 key), got ${keyBytes.length}`);
  }
  const key = crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  cachedKeyMaterial = { sourceValue: raw, key };
  return key;
}

/** True when `value` is this module's encrypted-envelope format, as opposed to a legacy plaintext row or any other opaque string. */
export function isEncryptedCredential(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypts `plaintext` into the self-describing `arvenenc:v1:<iv>:<ciphertext>` string form.
 * Throws `CredentialEncryptionUnavailableError` (fail closed) when no valid encryption secret is
 * configured — callers (chiefly `V1MutationService.setAiProviderApiKey`) must let this propagate
 * rather than falling back to storing the plaintext value.
 */
export async function encryptCredential(plaintext: string): Promise<string> {
  const key = await loadEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH) as Uint8Array<ArrayBuffer>);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${ENCRYPTED_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypts a value previously produced by `encryptCredential`. A value that is not in the encrypted
 * envelope format (a legacy pre-hardening plaintext row) is returned unchanged — no key required —
 * so an already-stored production credential keeps working even before an operator has configured
 * `ARVEN_CREDENTIAL_ENCRYPTION_KEY`. Throws `CredentialDecryptionError` on a wrong key or tampered
 * ciphertext, and `CredentialEncryptionUnavailableError` if the envelope is well-formed but no
 * secret is configured to attempt decryption with.
 */
export async function decryptCredential(stored: string): Promise<string> {
  if (!isEncryptedCredential(stored)) return stored;
  const key = await loadEncryptionKey();
  const rest = stored.slice(ENCRYPTED_PREFIX.length);
  const separatorIndex = rest.indexOf(":");
  if (separatorIndex < 0) throw new CredentialDecryptionError();
  const ivB64 = rest.slice(0, separatorIndex);
  const ciphertextB64 = rest.slice(separatorIndex + 1);
  let iv: Uint8Array<ArrayBuffer>;
  let ciphertext: Uint8Array<ArrayBuffer>;
  try {
    iv = fromBase64(ivB64);
    ciphertext = fromBase64(ciphertextB64);
  } catch {
    throw new CredentialDecryptionError();
  }
  try {
    const plaintextBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintextBuffer);
  } catch {
    // AES-GCM authentication failure (wrong key or tampered ciphertext) — never leak the raw bytes.
    throw new CredentialDecryptionError();
  }
}

/**
 * A non-reversible, non-secret fingerprint of a credential, used ONLY as an in-memory
 * request-deduplication scope key (`lib/ai/provider.ts`) — never persisted, logged, or returned to
 * a client. SHA-256 of the raw key; a hash, not the encryption above, because this never needs to
 * be reversed, only compared for equality within one process's lifetime.
 */
export async function fingerprintCredential(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plaintext));
  return toBase64(new Uint8Array(digest));
}
