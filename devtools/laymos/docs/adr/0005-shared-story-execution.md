---
status: superseded by ADR-0007
---

# Share one Story execution across every Scenario

Stories use one declared execution whose runtime narrative is observed under conditions prepared by each Scenario. Scenario preparation, verification, and optional cleanup are operational phases outside that narrative; every runnable Scenario intentionally verifies either the execution's success value or its typed error. This trades unrestricted Scenario bodies for a trustworthy unified Story that explains one implementation flow instead of merging conventionally related programs.

The Effect-native builder provides one fixed Story environment. Scenarios vary explicit prepared values and service state, never the dependency graph. The runner invokes the shared execution exactly once per runnable Scenario, records only that invocation, always attempts declared cleanup after successful preparation, and preserves failures by lifecycle phase without allowing cleanup to hide an earlier failure.
