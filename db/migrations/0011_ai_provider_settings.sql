PRAGMA foreign_keys = ON;

-- Lets the authenticated user paste their own AI provider API key into the app itself (Ayarlar ->
-- Yapay Zeka) after deploying, instead of needing wrangler secret put on the command line. api_key
-- is never returned to the client once saved -- only whether a key is set plus a masked last-4 hint.
-- env.OPENAI_API_KEY remains the fallback when no row exists here.
CREATE TABLE ai_provider_settings (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
