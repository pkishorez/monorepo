# Vitest owns test execution

## Decision

Laymos uses the selected project’s installed Vitest through its programmatic
API. Vitest owns discovery, configuration, fixtures, hooks, retries, timeouts,
worker isolation, and test status.

`laymos/test` only registers ordinary Vitest suites and cases and records
structured artifacts. Laymos maps the completed Vitest hierarchy into a
presentation-neutral report for DevTools. Task-location collection supplies a
Case's declaration line and column; Vitest does not supply its source end.

## Consequences

Existing Vitest suites are visible without adopting Laymos helpers. Projects do
not need a second test location, runner, lifecycle, or configuration.

Laymos depends on the compatible Vitest API installed by the selected project.
Runner startup failures are API failures; assertion failures remain report
data.
