# ARVEN Beslenme & Diyet V1 Architecture

## Product north star

ARVEN Beslenme & Diyet is a multi-user, mobile-first nutrition coaching PWA. AI supplies interpretation, personalization and proposals. Numeric truth comes from deterministic services using verified data. Personalization is derived from user-owned data. The approved mockup book is the canonical visual specification.

The product is not a diagnostic or treatment system. It may explain nutrition context, show uncertainty and suggest professional review; it must not diagnose, prescribe or instruct medication changes. ARVEN does not store or track medications. Nutrition-related supplements are a separate user-managed nutrition module.

## Runtime shape

```text
PWA client
  -> server routes / server actions
     -> authenticated identity + authorization
     -> request/schema validation
     -> deterministic nutrition engine
     -> ARVEN Context Engine
        -> server-only AI provider adapter
     -> relational repository (D1 first, PostgreSQL portable)
     -> object storage repository (R2 first, S3 compatible boundary)
```

## Main routes

Primary navigation:

- `/bugun`
- `/planim`
- `/arven`
- `/gelisim`
- `/daha-fazla`

Canonical secondary flows include `/analiz/ogun`, `/analiz/menu`, `/hedeflerim`, `/stratejim`, `/saglik/profil`, `/saglik/tahliller`, `/saglik/takviyeler`, `/rapor/gun-sonu`, `/profil`, `/arven/hafiza`, `/basarilarim` and `/ayarlar/bildirimler`.

## Portion model: natural outside, grams inside

The default user experience does not ask people to think in grams. Foods expose verified `FoodPortionOption` records such as:

- 2 adet yumurta
- 1 dilim ekmek
- 5 yemek kaşığı bulgur
- 1 küçük kase yoğurt
- 1 avuç badem
- 1 avuç içi kadar tavuk
- 1 paket kefir

Each option stores a verified `gramsPerUnit` value. A selection like `1 küçük kase yoğurt` is resolved to its internal gram amount first; only then does the deterministic nutrition engine calculate calories and macros. The UI may show the approximate gram equivalent as secondary detail (`≈ 180 g`). Custom grams remain available as an advanced fallback.

Historical meal entries persist both the natural display selection and the resolved grams so later edits to a food's portion catalog cannot silently change old nutrition logs.

## Deterministic layer

Code owns:

- resolving verified household/visual portions to grams
- portion scaling from verified per-100g nutrition facts
- meal/day energy and macro sums
- remaining targets and plan replacement deltas
- water totals and corrections
- date/timezone/nutrition-day boundaries
- daily/weekly averages and adherence
- measurement trends and milestones
- unit normalization and rounding
- per-meal target allocation validation
- target-calculation method/version/input provenance

AI may explain outputs but cannot overwrite them.

## Nutrition completeness

A missing nutrient is not zero. Core calories/macros require verified numeric data; optional fibre and micronutrients preserve completeness explicitly. Extended nutrients use one of:

- `complete` — the contributing source set is known complete for that nutrient
- `partial` — a numeric subtotal exists but one or more contributors are incomplete
- `unknown` — a trustworthy total cannot be calculated

This rule prevents dashboards from telling a user that they consumed `0 mg` of a micronutrient when the database simply does not provide the value. Historical meal snapshots persist the amount/unit/completeness state used at the time of logging.

## Food data and provenance

ARVEN normalizes multiple verified food providers behind one domain model. Initial provider identifiers include Open Food Facts, USDA, TURKOMP, BLS, Swiss Food Composition Database and manually verified records. Each record preserves provider, external source ID, verification time and optional evidence/license metadata.

Users may enable or prioritize providers, but the product layer does not become provider-specific. Barcode lookup, text search and recently logged foods all return the same normalized `Food` model.

Private user-created foods are always accessed through an authenticated `UserId` scope. Repository contracts require the scope explicitly so an adapter cannot accidentally return another user's private record. Meal-log writes additionally reject cross-user references to private foods at the persistence boundary.

## Allergy safety

Food-name substring checks are not accepted as safety evidence. Allergies use stable allergen identifiers and foods carry verified allergen IDs plus an allergen-data status. When a user has active allergies, unresolved allergen evidence fails closed: the food is not recommended until it can be resolved or the user chooses a verified alternative.

## Scientific goal provenance

If ARVEN calculates a nutrition target, the persisted goal records:

- calculation method
- method/version
- structured inputs used
- stable scientific reference IDs that resolve to stored reference rows

The UI can therefore answer “Bu hedef nereden geldi?” without asking an AI model to reconstruct the reasoning. Manual/professional targets may use a different `source` while still preserving provenance.

Meal energy allocation is stored separately as basis points and validated in code to total exactly 10,000 (= 100.00%). This supports personal breakfast/lunch/dinner/snack distributions without changing the daily numeric truth. Active goal intervals for the same user cannot overlap.

## AI boundary

Critical model responses use versioned schemas. `MealSuggestionV1` deliberately contains food candidates and natural portion hints, but no AI-authored grams, calories or macro totals. For example, AI may suggest `1 avuç içi kadar tavuk`; the server resolves that hint against verified food portion options, converts it to grams internally and recalculates nutrition locally.

If no verified natural portion mapping exists, ARVEN must ask for clarification or offer a custom/manual amount. AI-generated gram conversions are never promoted to trusted source data.

`WeeklyInsightV1` is narrative-only. Weekly adherence, averages, trends and other metrics are computed before the AI call and passed as context. The model may explain them through a summary, positives, improvement areas and suggestions, but the response schema does not contain replacement scores/calorie totals.

AI mutations follow:

1. authorize
2. build minimum task-specific context
3. call provider server-side
4. schema validate
5. apply health/allergy guardrails
6. resolve proposed natural portions against verified portion options
7. persist as a proposed action
8. wait for user confirmation
9. perform mutation idempotently
10. deterministically recalculate affected totals

## User preferences without forking numeric truth

Display/interaction preferences are separate from nutrition truth:

- kcal or kJ display
- configurable nutrition-day start minute
- home-card ordering with an ARVEN canonical default
- preferred nutrient ordering
- enabled/prioritized food data providers

Changing one of these preferences does not mutate historical nutrition values.

## Persistence

All user-owned records are scoped by `user_id`. Client-supplied ownership is ignored. The first migration establishes users, profiles, UI preferences, scientific references, versioned goals, meal target allocations, verified foods/portions/nutrients/allergens, provider preferences, assessment snapshots, meal/water logs and confirmed/proposed AI actions. It intentionally contains no medication registry.

Meal items preserve `portion_option_id`, natural quantity/label and resolved grams alongside their nutrition snapshot. Extended nutrients are also snapshotted so historical logs are stable when upstream provider data changes. D1-compatible SQL is used in hosted V1, while repository interfaces prevent product logic from depending on D1-specific APIs.

## Private storage

Meal photos, menu scans, body photos, lab files, audio and exports remain private. Object keys are user-scoped; every read/write/delete is authorized server-side. Public URLs are not persisted for sensitive files.

## PWA/offline policy

The shell is installable with 192px/512px icons. Offline fallback caches only public shell resources. Authenticated nutrition and health payloads are network-only until a separately reviewed encrypted offline-data design exists.

## Visual system

Core tokens:

- brand green `#075a3c`
- deep green `#053b2c`
- action green `#16794f`
- surface `#ffffff`
- soft surface `#f5f7f3`
- border `#dfe7df`
- text `#173229`
- muted `#64736c`

Macro semantics: calorie amber, protein green, carbohydrate orange, fat blue, water cyan. Body copy remains readable at mobile sizes; long mockups scroll vertically rather than being shrunk into one viewport.
