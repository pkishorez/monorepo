---
'@pkishorez/lotel': patch
---

Adopt std-toolkit's decoded entity types: `EntityType` becomes `DecodedEntity` across the flow, telemetry, and telemetry-store domains.

The telemetry HTTP payloads built from `EntitySchema` change shape with it — `_v` now rides inside each entity's `value` instead of its `meta`. Client and server must run the same version.
