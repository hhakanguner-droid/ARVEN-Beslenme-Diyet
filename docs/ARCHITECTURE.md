# ARVEN Beslenme & Diyet V1 Architecture

## Product north star

ARVEN Beslenme & Diyet is a multi-user, mobile-first nutrition coaching PWA. AI supplies interpretation, personalization and proposals. Numeric truth comes from deterministic services using verified data. The approved mockup book is the canonical visual specification.

The product is not diagnostic or treatment software. It does not store or track medications. AI must not diagnose, prescribe or instruct medication changes. Nutrition-related supplements are a separate future nutrition module.

## Runtime shape

```text
PWA client
  -> server routes / server actions
     -> authenticated external subject
     -> request/schema validation
     -> V1MutationService transaction boundary
        -> deterministic nutrition / goal calculators
        -> authenticated allergy & dietary safety context
        -> D1/SQLite repository adapter
     -> ARVEN Context Engine -> server-only AI provider
     -> private object storage repository (R2/S3 boundary)
```

Application features do not execute ad-hoc persistence writes. SQLite owns structural/referential integrity; authenticated semantic policy belongs to the mandatory mutation boundary.

## Main routes

Primary navigation: `/bugun`, `/planim`, `/arven`, `/gelisim`, `/daha-fazla`.

Canonical secondary flows include `/analiz/ogun`, `/analiz/menu`, `/hedeflerim`, `/stratejim`, `/saglik/profil`, `/saglik/tahliller`, `/saglik/takviyeler`, `/rapor/gun-sonu`, `/profil`, `/arven/hafiza`, `/basarilarim` and `/ayarlar/bildirimler`.

## Identity and ownership

The server-authenticated external subject is the ownership key. V1 deliberately has no separately mutable external-subject-to-internal-user mapping. Repository/service instances operate for one authenticated subject; client payloads never choose an owner.

Global food versions are readable by everyone. Private food versions are returned only when `owner_subject` matches the authenticated subject.

## Versioned nutrition truth

A `food_version` is a complete snapshot of core nutrition, extended nutrition, provenance, allergen evidence and dietary-safety evidence. Corrections create another version instead of mutating the old one.

A `portion_version` is one verified household/visual measure and gram conversion tied to an exact food version. If the gram equivalent changes, a new portion version is created. AI may reference a verified household portion but may not invent a trusted gram conversion. Custom grams remain a manual/user-confirmed fallback.

A `scientific_reference_version` is immutable evidence metadata. ARVEN-calculated goal versions copy the exact reference metadata they used so later catalog maintenance cannot rewrite historical goal provenance.

## Natural portions outside, grams inside

Users see familiar measures such as adet, dilim, kaşık, bardak, kase, avuç, avuç içi, porsiyon and paket. The mutation service resolves the selected immutable portion version to grams before deterministic nutrition calculation. Historical meal payloads preserve the exact food version, portion version/display, resolved grams, calculation version and nutrient snapshot.

## Nutrition events

Meal and water history use one append-only `nutrition_events` journal. A meal's complete item/portion/nutrient snapshot is one atomic JSON payload. There are no separately mutable meal-item or extended-nutrient child tables, so an item cannot be reparented, partially deleted or drift away from its historical snapshot.

Corrections create a new event/correction flow rather than rewriting historical numeric truth in place.

## Deterministic layer

Code owns portion resolution, nutrition scaling, meal/day totals, remaining targets, water totals, timezone/nutrition-day boundaries, weekly metrics, target calculations, unit normalization, rounding and per-meal target allocation validation. Missing nutrient data remains unknown/partial rather than being converted to zero.

`nutrition-v1` is the supported meal snapshot calculation version. Unsupported calculation versions are rejected before persistence.

## Goal calculation

ARVEN-calculated goals are created only through `mifflin-st-jeor@v1`. The caller supplies calculator inputs, reference-version IDs and meal allocations—not trusted calculated totals. The mutation service validates the inputs, derives all targets in code, resolves every scientific reference, snapshots its exact metadata, inserts a new goal version and selects it as current in one transaction.

Meal allocations are validated to total exactly 10,000 basis points (=100.00%). Manual goal versions remain a separate explicit source.

## AI proposal lifecycle

There is no mutable AI `status` column.

1. The server validates a versioned action schema and writes an immutable canonical proposal plus SHA-256 payload hash and idempotency key.
2. One immutable user decision is stored: confirmed or rejected.
3. Applying a confirmed proposal re-parses the stored payload, reloads authenticated safety context, resolves exact food/portion versions, deterministically calculates the result and creates a nutrition event.
4. The same transaction creates the single terminal `ai_action_outcomes` record.
5. `applied` requires an exact immutable result-event FK; `failed` cannot contain a result event. The schema makes the two terminal states mutually exclusive.
6. Retrying an applied action returns the exact linked event rather than running the mutation again.

`MealLogActionV1` permits only verified household portion-version references and the supported `nutrition-v1` calculation version. AI cannot smuggle a custom gram conversion into the mutation payload. `WaterLogActionV1` accepts only a finite bounded milliliter amount and canonical occurrence instant.

## ARVEN AI (chat, memory, weekly insight)

`lib/ai/context-engine.ts` assembles a deterministic per-request context (today's remaining targets, active allergen/dietary exclusions, recent ARVEN memory facts) and renders it into a compact Turkish system prompt. The prompt states *whether* numeric context exists but never embeds a specific figure, so the model has no number to echo back incorrectly.

`lib/ai/provider.ts` is a thin, injectable-fetch OpenAI chat-completion adapter (mirroring `lib/nutrition/providers/open-food-facts.ts`'s pattern), validating every response against `ArvenChatReplyV1` or `WeeklyInsightV1` from `lib/ai/contracts.ts` before it reaches a route. `getOptionalAiProvider` returns `null` when `OPENAI_API_KEY` is unset so `/api/ai/chat` and `/api/ai/weekly-insight` degrade to an informational-only reply instead of failing.

Chat-proposed water logging reuses the existing AI proposal lifecycle above unchanged (`createAiProposal`/`decideAiAction`/`applyConfirmedAiAction` with `water-log`); meal suggestions from chat remain informational only in this phase, actioned manually through the existing food search/log UI. ARVEN memory (`ai_memory_facts`) is the one AI-adjacent table that is directly user-deletable rather than an append-only ledger, since it is a live personalization input, not an audit record. Weekly insight snapshots (`weekly_insight_snapshots`) pair one `metrics_json` (from `lib/nutrition/weekly-metrics.ts`, computed the same way `Bugün` computes a single day, over a rolling 7-day window) with a nullable `narrative_json`; a snapshot is immutable once written, so a past week's exact wording and the exact numbers it was grounded in are never silently rewritten later. `weeklyNarrative`'s numeric-claim guard is what actually keeps the narrative number-free; the system prompt only asks nicely.

## ARVEN Vision (meal photo, menu scan, product photo)

Photo bytes never enter D1 or the per-user Durable Object's SQLite storage — `photo_assets` (`db/migrations/0005_phase5_vision.sql`, mirrored in `db/migrations/durable-object/0001_user_schema.ts`) stores only small metadata (kind, mime type, byte size, a storage key). The actual bytes live behind `lib/media/storage.ts`'s `MediaStorage` abstraction: `LocalFileMediaStorage` writes to `.data/media/` for local dev, `R2MediaStorage` wraps a Cloudflare R2 bucket for production (scaffolded as the `ARVEN_MEDIA` binding in `wrangler.jsonc`, not yet reachable — same "real-shaped but not yet wired" state the D1/DO adapter was in before Phase 1's routes could reach it). `getMediaStorage` picks whichever is available, mirroring `lib/persistence/local-runtime.ts`'s dev/prod split for the SQL layer.

`lib/ai/provider.ts` extends the OpenAI adapter with three vision-capable functions (`analyzeMealPhoto`, `analyzeMenuPhoto`, `identifyProductPhoto`), each sending the photo as a `data:` URL `image_url` content part alongside a text instruction, and validating the reply against `MealPhotoEstimateV1` / `MenuAnalysisV1` / `ProductPhotoIdentificationV1` from `lib/ai/contracts.ts`. These contracts reuse the same `FoodQuery`/`PortionHint`/numeric-claim/non-diagnostic guards as the chat and weekly-insight contracts — a photo is exactly as untrusted a source of numeric truth as free-form chat, so it never supplies a number either. Scope is deliberately narrow: a meal-photo estimate is a list of candidate `foodQuery`/`portionHint` pairs the user matches and confirms through the existing `FoodPicker` search flow (`components/nutrition/FoodPicker.tsx`, now accepting an `initialQuery`/`initialBarcode` prefill), so "user correction" and "deterministic recalculation after correction" fall out of the already-existing, already-tested manual meal-logging flow rather than needing new mutation logic; menu analysis is informational-only, ranking options with a three-way qualitative `fitsGoal` label (never a numeric score); and product-photo identification only ever proposes a candidate name/brand/barcode for the existing Phase 3 Open Food Facts search/barcode lookup to resolve, never nutrition numbers itself.

`/api/vision/meal-photo`, `/api/vision/menu-photo`, and `/api/vision/product-photo` each store the uploaded photo (`lib/api/vision-upload.ts`) and, when `getOptionalAiProvider` returns a configured provider, run the matching analysis — degrading to `{ ..., aiAvailable: false }` otherwise, the same graceful-degradation shape `/api/ai/weekly-insight` already established. `/api/photos/[id]` serves and deletes one photo's bytes, scoped to its owning subject. Account deletion (`purgeAuthenticatedUser`) already removes a user's `photo_assets` rows; deleting the underlying bytes themselves is a documented follow-up for the not-yet-built account-delete flow (Phase 9 scope).

## ARVEN Health context (lab results, supplements)

Lab documents get their own table, `lab_documents` (`db/migrations/0006_phase6_health.sql`, mirrored in the Durable Object schema), rather than joining `photo_assets`'s kind enum — that table's migration already shipped, and Clean V1 adds a new migration file instead of editing one that already merged. Otherwise the split is identical to Phase 5's: only metadata lives in SQL, the bytes live behind the same `lib/media/storage.ts` abstraction (`lib/api/lab-upload.ts` mirrors `lib/api/vision-upload.ts`).

`lab_result_entries` is the "extracted vs confirmed separation" the Phase 6 roadmap entry calls for: an AI extraction (`extractLabResult` in `lib/ai/provider.ts`, validated against `LabResultExtractionV1`) inserts rows with `status='extracted'`; nothing downstream ever treats those as the user's data until `/api/lab/entries/[id]` confirms one, optionally after the user edits the transcribed text, flipping it to `'confirmed'`. Unlike every other AI contract in this codebase, `LabResultExtractionV1` does not forbid numbers — a lab report's numbers are exactly the ground truth the user is trying to capture, so the usual "AI never states a number" rule (which exists only to stop invented *nutrition* numbers) does not apply here. What still applies unchanged is the non-diagnostic health policy from `lib/health-safety/policy.ts`: the model transcribes marker/value/range text, it never asserts a diagnosis or gives treatment direction about what it read. `lab_result_entries` is directly user-editable/deletable rather than append-only, the same precedent as `ai_memory_facts` — a live personal record the user manages, not an audit ledger of nutrition truth. Manual entry (`recordManualLabResultEntry`) skips the extraction step entirely and is stored already `'confirmed'`, since there is nothing to review when the user types it themselves.

`supplement_records` is explicitly **not** a medication registry, matching the roadmap's deliberate scope-down: there is no dosage, schedule, or reminder field anywhere in the schema or the API. A record only says "the user takes this," with an optional `food_version_id` pointing at the existing multi-source verified food catalog when the user's supplement happens to be found there (many vitamin/mineral products already live in Open Food Facts). Because `food_versions` lives in the shared D1 catalog — a genuinely separate database instance from the per-user Durable Object in production — the per-user schema's copy of `supplement_records` declares `food_version_id` with no foreign key at all (the D1-side combined-migration copy keeps one, since `validate_migration.py` runs all migrations on one connection); this is the same cross-database limitation already documented on `food_versions.owner_subject` in `durable-object-adapter.ts`'s `purgeAuthenticatedUser`. "Safe contextual explanations" for supplements are handled without any AI call at all: `lib/supplements/reference.ts` is a small static lookup table of short, human-written, non-diagnostic notes for common supplements (Vitamin D, B12, iron, and so on), matched by normalized name — there is no generative path here to jailbreak into a dosage or treatment claim, because there is no model in the loop.

`/api/vision/lab-photo`, `/api/lab/documents/[id]`, `/api/lab/entries`, `/api/lab/entries/[id]`, `/api/supplements`, `/api/supplements/[id]`, and `/api/supplements/reference` back the `saglik/tahliller` and `saglik/takviyeler` pages, both pre-registered canonical placeholder routes from Phase 1 that this phase's real pages now override. Account deletion additionally purges `lab_documents`, `lab_result_entries`, and `supplement_records`; deleting lab documents' underlying bytes is the same documented Phase 9 follow-up as photo assets.

## Weekly planning system (recipes, weekly plan, pantry, shopping list, week-prep)

`recipes` (`db/migrations/0008_phase7_planning.sql`) is a second, deliberately separate concept from the pre-existing "tarif oluşturucu" (`RecipeFoodV1`/`createRecipeFood`, `lib/persistence/v1-boundary.ts`). The older feature sums a recipe's ingredients once, at creation time, into a brand-new one-off `StoredCustomFoodVersion` — nutrition is frozen forever after. `RecipeCreateV1`/`createRecipe` instead stores the ingredient list itself (reusing the existing `RecipeIngredientV1` shape: a stable `foodVersionId` plus a portion selection per ingredient) and never freezes anything — every reader (weekly-plan creation, shopping-list generation) re-resolves the recipe's ingredients from whatever the food catalog says *right now*. This is what "recipes with stable ingredient identifiers" in the roadmap means in practice: the identifier that stays stable is the ingredient's verified `foodVersionId`, not a generated custom-food id. Recipes are add/list/get/delete only — there is deliberately no update endpoint; editing a recipe means deleting and recreating it, the same scope-down shape as several Phase 5/6 entities (`lab_documents`, `pantry_items` below).

`weekly_plan_versions`/`user_current_weekly_plan` mirror the existing `meal_plan_versions`/`user_current_meal_plan` versioned-plus-current-pointer pattern from Phase 3, but keyed additionally to `week_start_local_date` so every calendar week keeps its own independent "current" version — last week's plan, this week's plan and a future week's plan can all exist and be edited without clobbering each other. A plan's `days` array is validated to contain exactly the seven local dates `weekStartLocalDate + 0..6` (`addLocalDays`, a small new export in `lib/time/canonical.ts`), and every slot's items are resolved and safety-checked exactly like a manual meal log (`resolveWeeklyPlanItems` in `v1-boundary.ts`, generalizing `mealPayload`). A slot item can be a direct food or `{kind:"recipe", recipeId, servings}`; a recipe item is expanded into its ingredients purely to compute a total (nutrition scaled by `servings / recipe.servings`) and to safety-check every ingredient food, then collapsed into one snapshot line for display — the same "resolve once, store a snapshot" precedent `createMealPlanVersion` already established. That snapshot is what the day view renders; it is not what the shopping list uses.

`pantry_items` is simple, user-managed stock tracking: a label, an optional `food_version_id` (for automatic shopping-list matching) and either a gram quantity or a free-text note. There is no expiry date, no auto-decrement from meal logging, and no barcode/receipt scanning — this is a manual list, not an inventory system.

`generateShoppingList` is the piece that actually delivers on "shopping list generated from planned needs minus pantry," and it is the one place in this feature that deliberately does **not** trust the weekly plan's frozen display snapshot: for every `{kind:"recipe"}` line in the plan, it re-fetches that recipe by id and re-resolves its *current* ingredients (scaled by the same `servings` ratio stored in the snapshot), rather than reusing the plan's already-computed nutrition total — a recipe referenced from three different meals in the week aggregates into one shopping quantity per `foodVersionId` specifically because the reference is that stable id, not three independent frozen blobs. Needed quantities are then reduced by any pantry item sharing the same `food_version_id` with a non-null `quantity_grams`; a pantry item with no `food_version_id`, or no gram quantity, is never auto-subtracted — the user tracks it manually. Regenerating a week's list always fully replaces it (`replaceShoppingListItems`), including any items the user had already checked off, the same "regenerating starts clean" precedent as `createMealPlanVersion` replacing the current plan. If a plan references a recipe that has since been deleted, generation simply skips that line rather than failing the whole list.

Week-prep workflow and reminders are deliberately scoped down to exactly two small tables: `week_prep_preferences` (one row per user — enabled flag, a preferred day of week, a local time) and `week_prep_status` (one row per user per week — a completed/not-completed flag). There is **no** push-notification, SMS, or email delivery anywhere in this codebase, so the "reminder" is nothing more than this stored preference surfaced back to the user inside the app; nothing fires on a schedule. This mirrors the Phase 6 "explicitly not a medication registry" style of disclosure: the roadmap names the feature, and the deliberate scope-down is documented here rather than silently implied.

`/api/recipes`, `/api/recipes/[id]`, `/api/weekly-plan`, `/api/pantry`, `/api/pantry/[id]`, `/api/shopping-list`, `/api/shopping-list/[id]`, `/api/week-prep/preferences` and `/api/week-prep/status` back new pages (`/tarifler`, `/planim/haftalik`, `/kiler`, `/alisveris`, `/ayarlar/hafta-hazirlik`) reachable from `/planim` and the `daha-fazla` menu — no sixth bottom-navigation tab was added, keeping Phase 1's fixed five-tab constraint. Account deletion additionally purges `recipes`, `weekly_plan_versions`, `user_current_weekly_plan`, `pantry_items`, `shopping_list_items`, `week_prep_preferences` and `week_prep_status`. `pantry_items.food_version_id` and `shopping_list_items.food_version_id` carry no foreign key in the Durable Object schema copy, the same established cross-database limitation as `supplement_records.food_version_id` (`food_versions` lives in the separate D1 catalog in production).

## Safety

Allergies and explicit dietary safety exclusions are hard blocks. Immediately before a meal event is persisted, the transaction reloads the authenticated user's active exclusions and checks the exact immutable food versions. Relevant unknown safety evidence fails closed.

Medication records are not used because V1 does not store medications. Separately, user-facing AI output passes the non-diagnostic/non-treatment policy boundary.

## Time and nutrition day

AI/client payloads supply only a canonical UTC occurrence instant; they never supply persisted `local_date`. The mutation service derives the nutrition date from the authenticated user's IANA timezone and configurable nutrition-day start minute. This correctly handles Istanbul/UTC midnight crossings and shifted day boundaries.

## Persistence baseline

Clean V1 intentionally uses one readable D1/SQLite baseline migration with STRICT tables, foreign keys, uniqueness and simple CHECK constraints. There are no review-numbered migrations and no business-logic trigger maze.

Core records are `users`, `profiles`, `user_ui_preferences`, `scientific_reference_versions`, `goal_versions`, `user_current_goal`, `food_versions`, `portion_versions`, safety catalogs/preferences, `ai_action_proposals`, `ai_action_decisions`, `nutrition_events`, `ai_action_outcomes` and `assessment_snapshots`.

Append/version discipline is enforced by repository design: versioned/historical records have insert/read APIs, not generic update/delete mutation APIs. `lib/persistence/contracts.ts` is read-only; authenticated writes live in `lib/persistence/v1-boundary.ts`.

## Private storage and offline policy

Meal photos, menu scans, body photos, lab files, audio and exports remain private. Object keys are user-scoped and access is authorized server-side with short-lived authorization. Service-worker caches contain only public shell resources; authenticated health/nutrition payloads are not cached without a separately reviewed encrypted offline design.

## Visual system

The approved ARVEN mobile mockups remain the source of truth: green/white system, real food imagery, readable mobile cards, five-tab bottom navigation and natural vertical scroll. Long screens scroll rather than being shrunk into one viewport.
