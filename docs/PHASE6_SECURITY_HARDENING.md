# Phase 6 security hardening

This patch closes the post-merge Phase 6 review findings without weakening the product boundaries.

- Lab images are declared in the external-data-flow registry and require explicit per-transfer opt-in before any configured AI provider receives bytes.
- Vision-model lab output is treated as hostile input and every model-controlled text field, plus the combined rendered entry, is revalidated against the non-diagnostic/medication safety policy before persistence.
- Free-text supplement creation is restricted to the curated deterministic supplement reference; arbitrary medication names are rejected at the authenticated API boundary, and free-text supplement notes are disabled so this feature cannot become medication/dose/schedule storage.
- Lab confirmation keeps an immutable audit ledger containing both the original extraction and the user-confirmed/corrected value. Confirmed rows cannot be silently rewritten.
- Lab media upload performs compensating object deletion if metadata persistence fails. Deletion removes the storage object before metadata so a failed object deletion remains retryable rather than becoming an untraceable orphan.
- The persistence regression test now follows the no-free-text-note supplement policy rather than expecting the previous note behavior.

The explicit lab-AI opt-in header is `x-arven-lab-ai-consent: 1`. The client must only set it after presenting the lab-file transfer disclosure to the authenticated user. A separate local-only upload path remains available when no external transfer is requested.
