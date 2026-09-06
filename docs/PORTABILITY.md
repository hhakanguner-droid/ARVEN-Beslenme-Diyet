# User data portability

User data is not treated as a one-way import into ARVEN. Export and future re-import are product requirements.

## Planned export layers

### Versioned JSON

Machine-readable backup containing supported user-owned structured records with:

- export schema version
- generated timestamp
- user-scoped IDs
- goals and provenance
- preferences
- plans and meal logs
- water logs
- measurements/progress
- ARVEN memory items the user is allowed to inspect/export

Secrets, provider credentials, internal auth subjects and other users' data are never exported.

### CSV

Human-readable tables for common analysis/use outside ARVEN, such as meal logs, daily nutrition, water and measurements. CSV is an interchange/report format, not the lossless backup format.

### Private media manifest

Sensitive files such as meal photos, lab documents and body photos remain private objects. A full export may package them separately with a manifest that maps export-safe IDs to files. Permanent public URLs are not part of the export model.

## Import principles

- validate the export schema/version before writes
- authenticate the importing user server-side
- never trust owner IDs from the uploaded backup
- remap imported IDs to the authenticated user
- validate food source/provenance records before they become trusted numeric inputs
- make imports idempotent where practical and report skipped/conflicting items
- do not silently convert unknown nutrient values to zero

Portability work is scheduled before production hardening is considered complete.

## Implementation status (Phase 9)

Implemented: `lib/portability/export.ts` (versioned JSON export, `/api/export` GET), `lib/portability/csv.ts` (meal-log/water-log/measurements tables, `/api/export/csv` GET), `lib/portability/import.ts` (restore, `/api/export` POST). Every import always writes under the server-authenticated subject and always generates fresh ids — repeat-importing the same backup duplicates history rather than colliding, which the returned per-section counts surface to the caller. The media manifest section restores metadata only; re-importing binary bytes remains out of scope, matching "Permanent public URLs are not part of the export model" above. See `docs/ARCHITECTURE.md`'s "Portability, account deletion and hardening (Phase 9)" section for the full design notes.
