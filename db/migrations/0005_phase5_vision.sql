PRAGMA foreign_keys = ON;

-- Phase 5: vision — private photo metadata for meal-photo estimation, menu scanning, and
-- photo-assisted product discovery. User-owned (mirrored into the per-user Durable Object schema
-- at db/migrations/durable-object/0001_user_schema.ts). The actual image bytes never live in this
-- row or in D1/the Durable Object's SQLite storage — they go through the MediaStorage abstraction
-- in lib/media/storage.ts (a local file under `.data/media/` in dev, an R2 object in production);
-- this table only ever stores the small metadata needed to address and account for that object.
CREATE TABLE photo_assets (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('meal-photo', 'menu-photo', 'product-photo')),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8000000),
  storage_key TEXT NOT NULL CHECK (length(trim(storage_key)) > 0),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX photo_assets_user_idx ON photo_assets(user_subject, created_at);
