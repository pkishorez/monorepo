# Owned Effect Story runner

Stories run against real integrations, so Laymos owns their execution instead
of piggybacking on a test framework. `laymos stories` discovers `*.story.ts`
files, loads them through Jiti on Node, aliases `laymos/story` throughout the
loaded source graph to a private recording runtime, and runs Scenarios
sequentially in declaration order in one process.

The only authoring surface is `laymos/story`. Scenario lifecycle functions are
Effects, failures use Effect semantics, and timeouts use `Duration` values.
The recording runtime is not a package export and has no consumer-resolvable
types or runtime subpath.
There are no lifecycle hooks or assertion API; preparation, verification, and
cleanup are explicit parts of each Scenario declaration.

Rejected: a hidden test runner, Promise-based Stories, worker isolation,
parallel Scenario execution, retries, and watch mode. These add machinery or
make execution against real infrastructure less predictable.
