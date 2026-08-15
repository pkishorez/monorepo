# laymos

## Unreleased

### Changed

- Configured Modules now use `kind: "shared" | "entry"`; omitted `kind`
  means Normal.
- `subpaths` replaces `nested` for tree-shaking public doors.
- Module analysis now reports configured kind, source shape, and observed kind
  separately.
- Inspect supports Project and Layer views plus stable JSON output.
- Module lint reports kind totals and rejects unused Shared Modules.

### Earlier changes

- Vitest is the sole test runner.
- `laymos/test` registers ordinary Vitest suites with optional structured Value
  Test evidence.
- `laymos/node` runs the selected project’s installed Vitest and returns its
  completed project, module, suite, and case hierarchy.
- Test Case reports include Vitest's declaration line and column when
  available.
- The report package exports Effect Schemas for test reports and evidence.
- The CLI runs architecture linting and presents Vitest results through
  `laymos test [target]`, including assertions, traces, timing, and verbose
  Effect logs.

### Removed

- The previous runtime narration domain, custom execution engine, source
  rewriting command, and dedicated frontend block.
