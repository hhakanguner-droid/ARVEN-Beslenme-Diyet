# Delivery roadmap

## Phase 1 — Foundation
- application shell and five-tab navigation
- ARVEN design tokens and canonical mobile sizing
- deterministic nutrition engine
- verified food-source contract
- persistence interfaces + first migration
- health/safety guardrails
- PWA shell and health endpoint
- baseline tests

## Phase 2 — Identity, onboarding and profile
- production identity adapter
- user mapping and server-side authorization
- onboarding flow
- goals, health profile, allergies, preferences
- explicit safety acknowledgement and data consent

## Phase 3 — Core nutrition
- real `Bugün` repository query
- `Planım` with versioned meal plans
- meal detail, eaten/not-eaten and replacement flows
- water logging
- verified food search/import adapters
- deterministic daily totals and remaining targets

## Phase 4 — ARVEN AI
- Context Engine
- provider adapter
- structured chat and meal suggestions
- proposed/confirmed AI actions
- ARVEN memory with provenance, confidence and delete controls

## Phase 5 — Vision and menu analysis
- meal photo upload and private storage
- photo estimate + confidence + user correction
- menu scan/ranking
- deterministic recalculation after correction

## Phase 6 — Health modules
- lab upload/extraction with extracted vs confirmed separation
- medication and supplement records
- safe contextual explanations, no diagnosis/treatment instructions

## Phase 7 — Weekly planning system
- weekly review and plan generation
- pantry
- shopping list generated from planned needs minus pantry
- week-prep workflow and reminders

## Phase 8 — Progress and reports
- measurements and body composition
- body photo sets
- daily/weekly reports
- charts, milestones, achievements and adherence

## Phase 9 — Privacy and hardening
- export/delete flows
- accessibility and iPhone QA
- offline/error/loading states
- performance/security review
- cost telemetry, caching and request deduplication

Each phase requires type/build/tests plus canonical mockup comparison before merge.
