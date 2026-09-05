PRAGMA foreign_keys = ON;

-- Phase 6: lab documents — private metadata only, mirroring db/migrations/0005_phase5_vision.sql's
-- photo_assets split (bytes live in lib/media/storage.ts, never in this row or in D1/the Durable
-- Object's SQLite storage). Kept in its own table rather than folded into photo_assets's CHECK
-- constraint because that table's migration is already merged; Clean V1 adds a new migration file
-- rather than editing one that already shipped.
CREATE TABLE lab_documents (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8000000),
  storage_key TEXT NOT NULL CHECK (length(trim(storage_key)) > 0),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX lab_documents_user_idx ON lab_documents(user_subject, created_at);

-- Extracted vs confirmed lab values (the Phase 6 roadmap requirement). An AI extraction inserts
-- 'extracted' rows the user has not yet reviewed; confirming (optionally after editing the
-- transcribed text) flips a row to 'confirmed'. Directly user-editable/deletable rather than
-- append-only — the same precedent as ai_memory_facts (a live personal record the user manages,
-- not an audit ledger of nutrition truth).
CREATE TABLE lab_result_entries (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  lab_document_id TEXT REFERENCES lab_documents(id) ON DELETE SET NULL,
  marker_name TEXT NOT NULL CHECK (length(trim(marker_name)) > 0 AND length(marker_name) <= 160),
  value_text TEXT NOT NULL CHECK (length(trim(value_text)) > 0 AND length(value_text) <= 80),
  unit_text TEXT CHECK (unit_text IS NULL OR length(trim(unit_text)) <= 40),
  reference_range_text TEXT CHECK (reference_range_text IS NULL OR length(trim(reference_range_text)) <= 80),
  status TEXT NOT NULL CHECK (status IN ('extracted', 'confirmed')),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX lab_result_entries_user_idx ON lab_result_entries(user_subject, created_at);

-- Nutrition-related supplement records — explicitly NOT a medication registry. A record only says
-- "the user takes this"; there is no dosage schedule, reminder engine, or interaction checking (see
-- docs/ROADMAP.md's Phase 6 entry). When the user's supplement is found in the existing
-- multi-source verified food catalog (many vitamin/mineral products already live there via Open
-- Food Facts), food_version_id carries verified nutrient provenance; otherwise this is a free-text
-- name with no nutrient claim made anywhere in the app.
CREATE TABLE supplement_records (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  food_version_id TEXT REFERENCES food_versions(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 160),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX supplement_records_user_idx ON supplement_records(user_subject, is_active, created_at);
