---
'std-toolkit': patch
---

Remove draft versions from `std-toolkit/eschema`. `.draft(...)` is gone from the `ESchema`, `EntityESchema`, and `ValueESchema` builders, along with `DraftedESchema`, `DraftedEntityESchema`, and the draft type parameter on `AnyESchema`, `AnyUnkeyedESchema`, `AnyEntityESchema`, `AnyValueESchema`, and `ESchemaType`. To try a field before committing to it, append the next `evolve` step and develop against the Memory adapter, so a dropped step leaves no rows behind; the version is frozen only once a snapshot approves it. Story 19 now teaches this workflow.
