/**
 * Post-Faz-9 addition: lets the authenticated user paste their own AI provider API key into the
 * app itself (Ayarlar → Yapay Zeka) after deploying, instead of needing `wrangler secret put` on
 * the command line. `api_key` is never returned to the client once saved — every read-back path
 * (`V1MutationService.getAiProviderKeyStatus`) exposes only whether a key is set and a masked last-4
 * hint; the raw value is only ever read server-side, immediately before an outgoing OpenAI call
 * (`V1MutationService.getAiProviderApiKeyForRuntime`, used by the `/api/ai/*` and `/api/vision/*`
 * routes), and is never included in `lib/portability/export.ts`'s backup (see that file — it only
 * reads the tables it explicitly lists, so a table absent from that list is never exported).
 *
 * `env.OPENAI_API_KEY` (a real Cloudflare Worker secret) remains the fallback when no row exists
 * here — see `lib/ai/provider.ts`'s `getOptionalAiProvider` — so nothing breaks for a deployment
 * that still prefers to configure the key as an infrastructure secret instead.
 */
export const USER_DURABLE_OBJECT_AI_PROVIDER_SETTINGS = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_provider_settings (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
`;
