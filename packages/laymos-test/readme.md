# laymos-test

Consumer-level stress tests for the Laymos Stories API. The package contains
Effect workflows, real Story files run by the owned Story runner,
and integration tests for the `laymos/node` execution APIs.

Run the complete suite from the repository root:

```sh
pnpm --filter laymos-test test
```

`test:stories` runs the Story files through `laymos stories` and prints fresh
execution evidence. `test:integration` performs complete and focused
programmatic generation, validates the returned artifacts, and
verifies partial evidence from a deliberately failed Scenario before restoring
a passing generation.
