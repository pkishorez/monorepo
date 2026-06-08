import { Effect } from 'effect';
import type { Vitest } from 'vitest/node';
import { type SuiteNode, type TestEvent } from '../../analysis/index.js';
import { toResultTree, type ReportedModule } from '../result-tree/index.js';
import { testUpdatesFor, type ReportedModuleWithId } from '../emit/index.js';
import type { VitestRuntimeManager } from '../manager/index.js';

/** Publishes live {@link TestEvent}s for a run; a no-op when unset. */
export type Emitter = (event: TestEvent) => Effect.Effect<void>;

const noopEmitter: Emitter = () => Effect.void;

/** Raised when a run cannot be resolved (unknown feature/group) or executed. */
export class RunError extends Error {
  readonly _tag = 'RunError';
  constructor(message: string) {
    super(message);
  }
}

interface RunOutcome {
  readonly tree: SuiteNode;
  readonly modules: ReadonlyArray<ReportedModuleWithId>;
}

const runSpecsRaw = (
  vitest: Vitest,
  fileFilters: ReadonlyArray<string>,
  rootName: string,
): Effect.Effect<RunOutcome, RunError> =>
  Effect.tryPromise({
    try: async () => {
      vitest.resetGlobalTestNamePattern();
      const specs = await vitest.globTestSpecifications([...fileFilters]);
      const result = await vitest.runTestSpecifications(specs, false);
      const modules =
        result.testModules as unknown as ReadonlyArray<ReportedModuleWithId>;
      return {
        tree: toResultTree(
          rootName,
          modules as unknown as ReadonlyArray<ReportedModule>,
        ),
        modules,
      };
    },
    catch: (cause) => new RunError(`run failed: ${String(cause)}`),
  });

/**
 * Run a subset of the documented suite, publishing the ordered live event
 * sequence (`run-started` -> N x `test-updated` -> `run-finished`) for `pkg`
 * through `emit`, and returning the result tree.
 */
const runSpecs = (
  vitest: Vitest,
  fileFilters: ReadonlyArray<string>,
  rootName: string,
  pkg: string,
  emit: Emitter,
): Effect.Effect<SuiteNode, RunError> =>
  Effect.gen(function* () {
    yield* emit({ type: 'run-started', pkg });
    const outcome = yield* runSpecsRaw(vitest, fileFilters, rootName);
    for (const event of testUpdatesFor(pkg, outcome.modules)) {
      yield* emit(event);
    }
    yield* emit({ type: 'run-finished', pkg });
    return outcome.tree;
  });

/**
 * Run the entire documented suite for a package, returning its result tree and
 * publishing live events tagged with `pkg` (the caller's package label, which
 * may differ from the on-disk `packageDir`).
 */
export const runAll = (
  manager: VitestRuntimeManager,
  packageDir: string,
  pkg: string = packageDir,
  emit: Emitter = noopEmitter,
): Effect.Effect<SuiteNode, RunError> =>
  Effect.gen(function* () {
    const runtime = yield* manager.get(packageDir);
    return yield* runSpecs(runtime.vitest, [], packageDir, pkg, emit);
  });
