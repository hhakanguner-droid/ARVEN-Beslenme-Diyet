PRAGMA foreign_keys = ON;

-- Phase 4: ARVEN AI — memory facts and weekly insight report snapshots. Both tables are
-- user-owned (mirrored into the per-user Durable Object schema at
-- db/migrations/durable-object/0001_user_schema.ts) and carry no relationship to the shared
-- D1 catalog, so unlike food_versions/portion_versions they need no D1/DO split note.

-- ARVEN memory: small, user-visible facts the assistant keeps between conversations (e.g.
-- "kahvaltıda genelde yumurta tercih ediyor"). Deletable directly by the user — unlike every
-- other append-only ledger table in this schema, a memory fact is not an audit record of
-- something that happened; it is a live personalization input the user must be able to
-- correct or withdraw at any time.
CREATE TABLE ai_memory_facts (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  fact_text TEXT NOT NULL CHECK (length(trim(fact_text)) > 0 AND length(fact_text) <= 300),
  provenance TEXT NOT NULL CHECK (provenance IN ('user-stated','ai-inferred')),
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX ai_memory_facts_user_idx ON ai_memory_facts(user_subject, created_at);

-- One append-only snapshot per generated weekly review: the deterministic metrics ARVEN's
-- narrative was grounded in (metrics_json) alongside the validated narrative-only
-- WeeklyInsightV1 output (narrative_json, nullable until a provider has generated one), so a
-- past week's exact wording and the exact numbers it was allowed to see are never silently
-- rewritten by later catalog/goal changes.
CREATE TABLE weekly_insight_snapshots (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  week_start_local_date TEXT NOT NULL CHECK (length(week_start_local_date) = 10),
  metrics_json TEXT NOT NULL CHECK (json_valid(metrics_json) = 1 AND json_type(metrics_json) = 'object'),
  narrative_json TEXT CHECK (narrative_json IS NULL OR (json_valid(narrative_json) = 1 AND json_type(narrative_json) = 'object')),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX weekly_insight_snapshots_user_idx ON weekly_insight_snapshots(user_subject, week_start_local_date, created_at);
