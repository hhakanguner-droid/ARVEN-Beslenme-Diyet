# Existing Sites migration strategy

The current ARVEN Beslenme & Diyet site is treated as a visual/interaction prototype, not as the source of truth for business logic or persistence.

## Preserve

- approved visual language from the canonical mockup book
- five-tab mobile navigation: Bugün, Planım, ARVEN, Gelişim, Daha Fazla
- successful copy, interaction patterns and user flows already approved in the prototype
- ARVEN green/white identity, card hierarchy, food imagery direction and iPhone-first readability

## Replace rather than inherit

- demo/static nutrition numbers
- client-only state presented as persistent state
- AI-authored calorie/macro totals
- unvalidated AI payloads
- hard-coded user identity
- public/signed-forever sensitive image URLs
- any placeholder action that looks functional but has no backend mutation

## Connection plan

1. Merge the clean repository foundation to `main`.
2. Connect the existing Sites project to this repository/branch using the Sites repository integration.
3. Compare the rendered shell against the canonical approved mockups.
4. Port approved prototype components screen-by-screen into this repository where they improve fidelity.
5. Keep domain logic in `lib/` and persistence in repository adapters; never move business rules back into presentation components.
6. Replace each prototype fixture with a real repository/API source before declaring that flow complete.
7. After every migrated screen, perform iPhone viewport, scrolling, navigation, persistence and regression QA.

The prototype remains available as a visual reference until the repository-backed version reaches feature parity; it is not used as a database or hidden runtime dependency.
