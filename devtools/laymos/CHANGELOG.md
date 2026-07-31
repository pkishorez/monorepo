# laymos

## 0.0.2

### Patch Changes

- [`4be44ed`](https://github.com/pkishorez/monorepo/commit/4be44ed7294438f8c08bd00124b8e134b91971a6) Thanks [@pkishorez](https://github.com/pkishorez)! - Move the Effect trace recorder into its own package, `@pkishorez/effect-trace-recorder`.

  **Breaking:** the `@pkishorez/lotel/trace` subpath export has been removed. Import
  `makeTraceRecorder` and the `Captured*` types from `@pkishorez/effect-trace-recorder`
  instead:

  ```diff
  -import { makeTraceRecorder } from '@pkishorez/lotel/trace';
  +import { makeTraceRecorder } from '@pkishorez/effect-trace-recorder';
  ```

  The recorder never used anything from lotel's server, and lotel never used the
  recorder — pulling it out lets consumers capture Effect spans without depending on
  the OTLP server, and drops `laymos`' dependency on `@pkishorez/lotel` entirely.
  This removes the `std-toolkit -> laymos -> lotel -> std-toolkit` workspace cycle
  that made build ordering non-deterministic.

- Updated dependencies [[`4be44ed`](https://github.com/pkishorez/monorepo/commit/4be44ed7294438f8c08bd00124b8e134b91971a6)]:
  - @pkishorez/effect-trace-recorder@0.0.2

## Unreleased

### Changed

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
