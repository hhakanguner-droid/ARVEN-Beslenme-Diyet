# ARVEN Beslenme & Diyet V1 Architecture

## Product north star

ARVEN Beslenme & Diyet is a multi-user, mobile-first nutrition coaching PWA. AI supplies interpretation, personalization and proposals. Numeric truth comes from deterministic services using verified data. Personalization is derived from user-owned data. The approved mockup book is the canonical visual specification.

The product is not a diagnostic or treatment system. It may explain nutrition context, show uncertainty and suggest professional review; it must not diagnose, prescribe or instruct medication changes.

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

Canonical secondary flows include `/analiz/ogun`, `/analiz/menu`, `/hedeflerim`, `/stratejim`, `/saglik/profil`, `/saglik/tahliller`, `/saglik/ilac-takviye`, `/rapor/gun-sonu`, `/profil`, `/arven/hafiza`, `/basarilarim` and `/ayarlar/bildirimler`.

## Deterministic layer

Code owns:

- portion scaling from verified per-100g nutrition facts
- meal/day energy and macro sums
- remaining targets and plan replacement deltas
- water totals
- date/timezone boundaries
- daily/weekly averages and adherence
- measurement trends and milestones
- unit normalization and rounding

AI may explain outputs but cannot overwrite them.

## AI boundary

Critical model responses use versioned schemas. `MealSuggestionV1` deliberately contains food candidates and proposed gram amounts, but no AI-authored calorie or macro totals. Suggested foods are resolved against the verified catalog and totals are recalculated locally.

AI mutations follow:

1. authorize
2. build minimum task-specific context
3. call provider server-side
4. schema validate
5. apply health/allergy guardrails
6. persist as a proposed action
7. wait for user confirmation
8. perform mutation idempotently
9. deterministically recalculate affected totals

## Persistence

All user-owned records are scoped by `user_id`. Client-supplied ownership is ignored. The first migration establishes users, profiles, versioned goals, verified foods, allergies/preferences, meal logs, water logs and confirmed/proposed AI actions.

D1-compatible SQL is used in hosted V1, while repository interfaces prevent product logic from depending on D1-specific APIs.

## Private storage

Meal photos, menu scans, body photos, lab files, audio and exports remain private. Object keys are user-scoped; every read/write/delete is authorized server-side. Public URLs are not persisted for sensitive files.

## PWA/offline policy

The shell is installable. Offline fallback caches only public shell resources. Authenticated nutrition and health payloads are network-only until a separately reviewed encrypted offline-data design exists.

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
