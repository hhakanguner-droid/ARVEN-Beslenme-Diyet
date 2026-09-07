/**
 * Faz 9 hardening applied to every per-user Durable Object on wake: closes the account-deletion
 * race where a concurrent upload could land between `/api/account` DELETE listing this user's media
 * and finishing the (potentially slow, network-bound) storage deletes, leaving an orphaned private
 * object with no metadata row pointing at it.
 *
 * `account_deletion_state` holds at most one row per user: its mere presence is the "deletion in
 * progress" tombstone `DurableObjectV1Transaction.insertPhotoAsset`/`insertLabDocument`/
 * `insertBodyPhotoSet`/`insertProgressReportExport` check (synchronously, in the same non-yielding
 * stretch of the adapter method as the insert itself, so no concurrent request can observe a gap)
 * before recording any new media metadata. `ON DELETE CASCADE` means a completed
 * `purgeAuthenticatedUser` clears this row for free — no separate cleanup step can be forgotten —
 * but `purgeAuthenticatedUser` also deletes it explicitly first, matching this file's existing
 * per-table convention.
 */
export const USER_DURABLE_OBJECT_PHASE9_DELETION_HARDENING = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS account_deletion_state (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  started_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
`;
