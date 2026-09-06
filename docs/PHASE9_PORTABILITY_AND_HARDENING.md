# Phase 9 — Portability, account deletion and hardening

This closes out `docs/ROADMAP.md`'s final planned phase: data portability, a real account-deletion flow, offline/error/loading states, an accessibility pass, and a small amount of AI-cost/perf hardening.

- **Data export**: `/api/export` (GET) returns a full versioned JSON backup (`ArvenNutritionExportV1`); `/api/export/csv?section=meal-log|water-log|measurements` returns a human-readable table. Both are scoped strictly to the authenticated subject.
- **Data import**: `/api/export` (POST) restores a previously downloaded backup. The uploaded file's contents are never trusted for ownership — every restored row is written under the caller's own authenticated subject, with a freshly generated id. Restoring the same backup twice duplicates history rather than colliding; the response reports exactly how many rows were imported/skipped per section.
- **Account deletion**: `/api/account` (DELETE) requires `{"confirm":"HESABIMI SIL"}` in the body, deletes every private media object (meal/menu/product photos, lab documents, body-progress photos, generated PDF reports) and only then purges the account and every other row. This was an explicitly flagged Phase 9 follow-up left by `purgeAuthenticatedUser`'s own doc comment in Phase 8 — it is now closed.
- **Offline/error/loading states**: `app/(app)/error.tsx`, `app/(app)/loading.tsx`, `app/(app)/not-found.tsx`, and a root `app/global-error.tsx` — none existed before this phase.
- **Accessibility**: a site-wide `:focus-visible` outline (there was none before), a skip-to-content link, and a `prefers-reduced-motion` rule.
- **Cost telemetry / request deduplication**: `lib/ai/telemetry.ts`, wired into `lib/ai/provider.ts`'s single AI call choke point. Tracks token usage and an approximate (not billed) cost per endpoint in-process, and collapses concurrent identical AI requests into one network call without ever serving a stale result.

## Explicitly out of scope, disclosed

- **A literal manual iPhone/VoiceOver device QA pass.** No physical device or screen-reader session exists in this environment. The accessibility work here is real code (focus indicators, skip link, reduced-motion), not a substitute for that manual pass — it should still happen before this is treated as fully QA'd on-device.
- **Re-importing media bytes.** A backup only ever contains media *metadata* (id, kind, size, storage key) — never the underlying photo/document bytes, matching `docs/PORTABILITY.md`'s existing "Private media manifest" design. Import always reports these rows as skipped.
- **A persisted telemetry pipeline.** `lib/ai/telemetry.ts` is in-process and resets on redeploy — there is no metrics/analytics infrastructure anywhere else in this app to persist into, so building one here would be scope well beyond "cost telemetry" for a single AI provider dependency.
- **User-facing UI preference read/write (`user_ui_preferences`).** That table exists in the schema and is already purged on account deletion, but no read/write path was ever wired up in an earlier phase; the JSON export's `preferences` section is therefore limited to what is actually persisted today (timezone, nutrition-day start minute) rather than the full `UserNutritionPreferences` shape in `lib/preferences/types.ts`. Wiring that up is pre-existing, unrelated work, not a Phase 9 regression.

## Verification

Full test suite (272 tests), TypeScript type check, migration validation script, and production build all pass locally on Node 22 before merge.
