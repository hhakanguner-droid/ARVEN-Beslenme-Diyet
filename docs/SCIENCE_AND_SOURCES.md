# Science and source provenance policy

ARVEN must be able to answer two different questions without asking an AI model to improvise:

1. **Where did this food/nutrient value come from?**
2. **How was this user's target calculated?**

## Food and nutrient data

Every trusted food carries a source provider, verification timestamp and, for external providers, an external source ID. Optional evidence URL and license ID are retained when available.

Initial provider identifiers supported by the domain model:

- Open Food Facts
- USDA
- TURKOMP
- BLS
- Swiss Food Composition Database
- manually verified records

Adding a provider requires a separate review of its API terms, data license, nutrient units, allergen semantics and update policy before production ingestion.

### Missing nutrient values

Missing does not mean zero. Optional fibre and micronutrients use explicit completeness states. A partial total may be displayed as partial; an unknown total must remain unknown. The UI should explain incomplete coverage rather than create false precision.

## Target calculations

Calculated targets persist:

- calculation `method`
- algorithm/formula `version`
- structured `inputs`
- stable `referenceIds`

Published references are represented separately from user data. A future target-calculation service must be covered by unit tests and fixture/reference comparisons before it is used to create active goals.

ARVEN AI is not a target calculator. It may explain a deterministic target and discuss practical implementation, but it cannot replace the stored target with its own calorie/macro numbers.

## Per-meal allocation

Daily energy can be allocated across meal types. Allocations are stored as basis points and code must validate that they total exactly 10,000 (100.00%). This is a planning preference, not a change to the user's daily target.

## Historical stability

Meal logs snapshot the numeric values, natural portion selection, resolved grams and micronutrient completeness used at the time of logging. Later upstream data corrections may improve new calculations without silently rewriting historical records.
