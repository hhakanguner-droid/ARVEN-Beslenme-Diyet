PRAGMA foreign_keys = ON;

-- Phase 8: progress and reports (see docs/ARCHITECTURE.md's Phase 8 section for the full
-- rationale). Everything here is deterministic: body measurements/photos are numbers and images
-- the user entered themselves, milestones are computed purely from that history (never from an AI
-- guess), and a report export is a rendered PDF snapshot of already-computed deterministic metrics
-- (see lib/progress/pdf.ts, lib/progress/reports.ts). No AI-authored numbers, no medication or
-- diagnosis content, no background job or push-notification infrastructure (same boundary as
-- Phase 6/7 — see their equivalent notes). The optional activity/sleep/step context integrations
-- named in docs/ROADMAP.md's Phase 8 entry are explicitly deferred out of this delivery: they need
-- a real external OAuth connection this repository does not have configured, so building storage
-- against an unverifiable third-party contract now would just be guessing at its shape.

-- One row per logged measurement moment (a user can log more than once per day, e.g. a correction).
-- At least one of the five figures must be present — an empty measurement carries no information.
CREATE TABLE body_measurements (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  weight_kg REAL CHECK (weight_kg IS NULL OR (weight_kg >= 20 AND weight_kg <= 400)),
  body_fat_percent REAL CHECK (body_fat_percent IS NULL OR (body_fat_percent >= 1 AND body_fat_percent <= 75)),
  waist_cm REAL CHECK (waist_cm IS NULL OR (waist_cm >= 20 AND waist_cm <= 300)),
  hip_cm REAL CHECK (hip_cm IS NULL OR (hip_cm >= 20 AND hip_cm <= 300)),
  chest_cm REAL CHECK (chest_cm IS NULL OR (chest_cm >= 20 AND chest_cm <= 300)),
  note TEXT,
  created_at TEXT NOT NULL,
  CHECK (weight_kg IS NOT NULL OR body_fat_percent IS NOT NULL OR waist_cm IS NOT NULL OR hip_cm IS NOT NULL OR chest_cm IS NOT NULL)
) STRICT, WITHOUT ROWID;
CREATE INDEX body_measurements_user_idx ON body_measurements(user_subject, local_date);

-- A private body-progress photo (front/side/back or untagged). Same mime/size limits as
-- photo_assets (Phase 5) but a dedicated table rather than a new `kind` there, since SQLite cannot
-- widen an existing CHECK constraint without rebuilding the table — a needless risk to a table
-- three earlier phases already depend on.
CREATE TABLE body_photo_sets (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  angle TEXT CHECK (angle IS NULL OR angle IN ('front', 'side', 'back')),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8000000),
  storage_key TEXT NOT NULL CHECK (length(trim(storage_key)) > 0),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX body_photo_sets_user_idx ON body_photo_sets(user_subject, local_date);

-- Deterministic achievement ledger: a (user_subject, milestone_key) pair can only ever be earned
-- once (enforced here, not just in application code — see V1MutationService.recordBodyMeasurement).
-- Never retracted, even if the measurement that triggered it is later deleted: an earned badge is a
-- record of a moment that happened, not a live-recomputed property.
CREATE TABLE progress_milestones (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL CHECK (length(trim(milestone_key)) > 0),
  achieved_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE UNIQUE INDEX progress_milestones_user_key_idx ON progress_milestones(user_subject, milestone_key);

-- Metadata for one already-rendered PDF report (see lib/progress/pdf.ts). The bytes themselves live
-- in the same private object storage as photo_assets/lab_documents (lib/media/storage.ts) — this
-- row is only what is needed to address, re-serve, and delete that object later.
CREATE TABLE progress_report_exports (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly')),
  period_local_date TEXT NOT NULL CHECK (period_local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  mime_type TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8000000),
  storage_key TEXT NOT NULL CHECK (length(trim(storage_key)) > 0),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX progress_report_exports_user_idx ON progress_report_exports(user_subject, created_at);
