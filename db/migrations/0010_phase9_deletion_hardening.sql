PRAGMA foreign_keys = ON;

-- Faz 9 hardening: closes the account-deletion race where a concurrent upload could land between
-- /api/account DELETE listing this user's media and finishing the (potentially slow, network-bound)
-- storage deletes, leaving an orphaned private object with no metadata row pointing at it. This
-- table holds at most one row per user: its mere presence is the "deletion in progress" tombstone
-- checked synchronously by the adapter before recording any new media metadata. ON DELETE CASCADE
-- means a completed purge clears this row for free.
CREATE TABLE account_deletion_state (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  started_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
