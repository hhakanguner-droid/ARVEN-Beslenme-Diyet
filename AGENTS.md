# ARVEN Beslenme & Diyet — coding rules

1. **Canonical UI:** approved mockups are the visual source of truth; preserve readable mobile sizing, vertical scroll and five-tab navigation.
2. **No production fixtures:** never invent users, meals, calories, measurements, lab values or progress data.
3. **Deterministic numeric truth:** calories, macros, water, targets, trends and adherence come from verified structured data and code, never AI narrative.
4. **Natural portions outside, grams inside:** household measures resolve through immutable verified `portion_version` records. Changed conversions create new versions. AI actions may reference verified household portions but may not author trusted gram equivalents; custom grams are manual/user-confirmed.
5. **Verified/versioned food truth:** a `food_version` is a complete immutable nutrition + safety + provenance snapshot. Corrections create a new version; history and confirmed proposals keep the exact version the user saw.
6. **One mutation boundary:** application code must not write persistence tables with ad-hoc SQL. All authenticated V1 writes go through the server-side mutation service/repository transaction boundary. SQLite provides structural/referential constraints; authenticated semantic policy belongs to that mandatory boundary and is tested there.
7. **AI lifecycle is derived, not mutable:** immutable proposal + immutable decision; no mutable status column. Exactly one `ai_action_outcomes` terminal row may exist per action. `applied` must point to the exact immutable `nutrition_event`; `failed` must have no result event. Application writes the event and outcome in one transaction, and retries return the exact linked event.
8. **Server-derived dates:** client/AI never chooses persisted nutrition-day buckets. `local_date` is derived from canonical occurrence time plus authenticated IANA timezone and nutrition-day start.
9. **Health boundary:** ARVEN is not diagnostic/treatment software and does not store/track medications. AI must not diagnose, prescribe or recommend medication changes. Nutrition supplements are a separate future module.
10. **Safety hard blocks:** active allergies and dietary exclusions are loaded inside the authenticated transaction and rechecked immediately before a meal event is persisted. Unknown relevant safety evidence fails closed.
11. **User isolation:** the server-authenticated external subject is the ownership key; there is no separately mutable subject→internal-user binding. Never trust a client owner id or expose writes that accept arbitrary owners.
12. **Append/version discipline:** goal/food/portion/reference versions, AI proposals/decisions/outcomes, nutrition events and assessments are append-only through repository APIs. Corrections create new versions/events; no generic update/delete method may be added.
13. **Calculated goals are derived:** ARVEN-calculated goal targets are created only through the supported versioned calculator and exact scientific-reference snapshots; callers never supply trusted calculated totals.
14. **Secrets stay server-side.**
15. **Private files:** private media/exports require ownership checks and short-lived authorization.
16. **Offline privacy:** service workers must not cache authenticated health/nutrition payloads without an approved encrypted design.
17. **Real food imagery only:** exact licensed source photo or user's own photo; otherwise intentional no-photo state.
18. **Change discipline:** feature branches + PR review; keep `main` releasable.
