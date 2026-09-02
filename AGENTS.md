# ARVEN Beslenme & Diyet — coding rules

These rules apply to humans and coding agents working in this repository.

1. **Canonical UI:** approved ARVEN Beslenme & Diyet mockups are the visual source of truth. Preserve readable mobile sizing, natural vertical scroll and the five-tab bottom navigation.
2. **No production fixtures:** never make the application appear functional by inventing users, meals, calories, measurements, lab values or progress data. Use explicit empty/loading/setup states until real persistence exists.
3. **Deterministic numeric truth:** calories, macros, water totals, remaining targets, trends and adherence are calculated in code from structured verified data. AI must not author these totals.
4. **Verified food provenance:** nutrition records require an approved source and verification timestamp. AI-generated nutrition facts are not accepted as source data.
5. **AI proposes; user confirms:** plan/log/profile mutations proposed by AI are structured, validated, persisted as proposed actions and applied only after explicit confirmation.
6. **Health boundary:** the product is not diagnostic or treatment software. Do not diagnose, prescribe, instruct medication changes or turn OCR/photo estimates into facts.
7. **Safety constraints are hard blocks:** allergies and explicit dietary safety exclusions override recommendation quality or convenience.
8. **User isolation:** all user-owned persistence operations are scoped server-side by authenticated internal user id. Never trust a client-supplied owner id.
9. **Secrets stay server-side:** no database/storage/AI credential may enter client bundles, logs or `NEXT_PUBLIC_*` variables.
10. **Private files:** meal photos, body photos, labs, audio and exports are private objects. Access requires an ownership check and short-lived authorization.
11. **Offline privacy:** service-worker caches must never persist authenticated health/nutrition payloads unless a separate encrypted offline design is explicitly approved.
12. **Change discipline:** develop on feature branches and review through pull requests; keep `main` releasable.
