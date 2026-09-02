# Delivery roadmap

## Phase 1 — Foundation
- application shell and five-tab navigation
- ARVEN design tokens and canonical mobile sizing
- deterministic nutrition engine
- natural portions outside / verified grams inside
- multi-source verified food-source contract
- nutrient completeness model (`complete` / `partial` / `unknown`)
- scientific goal-calculation provenance contract
- per-meal energy allocation contract
- barcode + recently logged food repository contracts
- kcal/kJ, nutrition-day-start and modular home-card preference contracts
- identifier-based allergen safety
- persistence interfaces + expanded first migration
- PWA shell/icons and health endpoint
- frozen dependency graph + baseline tests

## Phase 2 — Identity, onboarding and profile
- production identity adapter
- user mapping and server-side authorization
- structured assessment/onboarding snapshots
- goals, health profile, allergies, preferences
- nutrition-day start and energy unit preferences
- home-card/nutrient ordering settings
- food-source enable/priority settings
- goal calculation details screen: method, inputs and scientific sources
- explicit safety acknowledgement and data consent

## Phase 3 — Core nutrition
- real `Bugün` repository query
- `Planım` with versioned meal plans
- meal detail, eaten/not-eaten and replacement flows
- per-meal target distribution
- water quick-add + one-step correction
- verified food search/import adapters
- barcode scan + manual barcode lookup
- recently logged / quick re-log
- multi-source catalog selection and deduplication
- micronutrient display with completeness indicators
- custom foods and recipe builder
- deterministic daily totals and remaining targets

## Phase 4 — ARVEN AI
- Context Engine
- provider adapter
- structured chat and meal suggestions
- proposed/confirmed AI actions
- ARVEN memory with provenance, confidence and delete controls
- deterministic weekly metrics -> narrative-only `WeeklyInsightV1`

## Phase 5 — Vision and menu analysis
- meal photo upload and private storage
- photo estimate + confidence + user correction
- menu scan/ranking
- barcode/photo-assisted product discovery where source evidence exists
- deterministic recalculation after correction

## Phase 6 — Health modules
- lab upload/extraction with extracted vs confirmed separation
- medication and supplement records
- morphology-aware safety checks plus structured output guardrails
- safe contextual explanations, no diagnosis/treatment instructions

## Phase 7 — Weekly planning system
- weekly review and plan generation
- recipes with stable ingredient identifiers
- pantry
- shopping list generated from planned needs minus pantry
- week-prep workflow and reminders

## Phase 8 — Progress and reports
- measurements and body composition
- body photo sets
- daily/weekly reports
- charts, milestones, achievements and deterministic adherence
- PDF/shareable report generation from verified metrics
- optional activity/sleep/step context integrations after explicit user connection

## Phase 9 — Privacy, portability and hardening
- versioned JSON export/import
- human-readable CSV exports for nutrition/progress data
- private-media export manifest
- account delete flow
- accessibility and iPhone QA
- offline/error/loading states
- performance/security review
- cost telemetry, caching and request deduplication

Each phase requires type/build/tests plus canonical mockup comparison before merge.
