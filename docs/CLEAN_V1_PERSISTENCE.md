# Clean V1 persistence architecture

The original bootstrap accumulated review-specific SQLite triggers until the protection layer became harder to reason about than the product. Clean V1 removes that design while keeping deterministic nutrition, verified provenance, natural portions, safety policy and approved UI.

## Ownership
The authenticated external subject is the ownership key. There is no mutable external-subject-to-internal-user mapping. Repository/service instances are created for one authenticated subject and do not expose an owner argument to client code.

Account deletion is not a raw `DELETE FROM users` operation. The mutation adapter must implement `purgeAuthenticatedUser(subject)` as one transaction that deletes dependent AI outcomes/decisions/proposals, nutrition events, goals/profile/preferences/safety rows and finally the user in dependency-safe order. The public service exposes only this authenticated purge path, so restrictive lifecycle foreign keys remain useful during ordinary operation without blocking account deletion.

## Versioned truth
`food_versions` is a complete nutrition + provenance + safety snapshot. `portion_versions` is a verified household conversion tied to one food version. Goals are immutable `goal_versions`; ARVEN-calculated targets are derived inside the mutation service from `mifflin-st-jeor@v1` inputs. Scientific evidence is itself versioned and copied into each calculated goal as an exact reference snapshot. Corrections create new versions.

## Nutrition events
Meal and water history share one immutable `nutrition_events` journal. A meal's food, portion, calculation and nutrient snapshots are one atomic JSON payload. There are no mutable child rows to reparent, partly delete or drift from a parent.

## AI lifecycle
There is no mutable `ai_actions.status`. `ai_action_proposals` stores the canonical immutable proposal and hash; `ai_action_decisions` stores one immutable decision. One `ai_action_outcomes` row is the only terminal record and is either `applied` with an exact immutable event FK or `failed` with no event. This makes applied-vs-failed mutually exclusive by schema. Retry of an applied action resolves the same event.

Proposal idempotency is an atomic persistence primitive, not a read-then-insert sequence. `insertProposalIfAbsent` must bind `(user_subject, idempotency_key)` using insert-on-conflict/read semantics inside the storage transaction and return either the newly inserted immutable proposal or the already-bound proposal. A normal concurrent retry must never escape as a uniqueness error.

## Time
Occurrence instants are canonical UTC. Persisted `local_date` is never accepted from AI/client input. `deriveNutritionLocalDate` uses authenticated IANA timezone plus nutrition-day start, including Istanbul midnight crossings.

## Boundary
SQLite is private storage, not an authorization API. It enforces foreign keys, uniqueness, strict numeric storage and basic shape. The mandatory server mutation boundary enforces authenticated scope, schema/calculation versions, idempotency, safety, verified portions, deterministic nutrition, scientific-goal derivation and local-date derivation in the same transaction that writes state. No application feature may add ad-hoc write SQL or generic update/delete APIs for append-only/versioned tables.
