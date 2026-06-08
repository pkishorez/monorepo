import { Effect, type Scope } from 'effect';
import { createVitest } from 'vitest/node';
import type { Vitest } from 'vitest/node';

/** The documented suite glob: the ONLY files the live server ever runs. */
export const DOCUMENTED_SUITE_GLOB = 'vtest/features/**/tests/**/*.test.ts';

/** How long a package's runtime may sit idle before it is closed and evicted. */
export const DEFAULT_IDLE_MS = 5 * 60 * 1000;

interface Entry {
  readonly vitest: Vitest;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * A lazily-booted, package-scoped Vitest runtime, plus a boot counter so
 * callers (and tests) can observe cache reuse.
 */
export interface Runtime {
  readonly vitest: Vitest;
  readonly bootCount: number;
}

/**
 * A lazy, cached manager of programmatic `createVitest` instances keyed by
 * package directory. The first `get` for a package boots a Vitest configured
 * to glob ONLY the documented suite; subsequent `get`s reuse it. Each instance
 * is closed and evicted after an idle period, and all instances are closed when
 * the owning scope is released.
 */
export interface VitestRuntimeManager {
  readonly get: (packageDir: string) => Effect.Effect<Runtime>;
}

const bootVitest = async (packageDir: string): Promise<Vitest> => {
  const vitest = await createVitest(
    'test',
    {
      root: packageDir,
      watch: false,
      include: [DOCUMENTED_SUITE_GLOB],
      // A no-op reporter: this runtime is driven programmatically, so it must
      // never print to the parent process's console (e.g. leaking the failures
      // of fixture suites that callers deliberately run and assert on).
      reporters: [{}],
      silent: true,
    },
    {},
    {},
  );
  await vitest.standalone();
  return vitest;
};

/**
 * Build a {@link VitestRuntimeManager} scoped to the given idle timeout. The
 * returned effect registers a finalizer that closes every booted runtime, so
 * provide it via a scoped layer.
 */
export const makeManager = (
  idleMs: number = DEFAULT_IDLE_MS,
): Effect.Effect<VitestRuntimeManager, never, Scope.Scope> =>
  Effect.gen(function* () {
    const cache = new Map<string, Entry>();
    const bootCounts = new Map<string, number>();

    const close = (entry: Entry): Promise<void> =>
      entry.vitest.close().catch(() => undefined);

    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        const entries = [...cache.values()];
        cache.clear();
        for (const entry of entries) {
          if (entry.timer) clearTimeout(entry.timer);
          await close(entry);
        }
      }),
    );

    const arm = (key: string, entry: Entry): void => {
      if (entry.timer) clearTimeout(entry.timer);
      if (idleMs === Infinity) return;
      entry.timer = setTimeout(() => {
        if (cache.get(key) === entry) cache.delete(key);
        void close(entry);
      }, idleMs);
      entry.timer.unref?.();
    };

    const get = (packageDir: string): Effect.Effect<Runtime> =>
      Effect.gen(function* () {
        const existing = cache.get(packageDir);
        if (existing) {
          arm(packageDir, existing);
          return {
            vitest: existing.vitest,
            bootCount: bootCounts.get(packageDir) ?? 1,
          };
        }
        const vitest = yield* Effect.promise(() => bootVitest(packageDir));
        const entry: Entry = { vitest, timer: undefined };
        cache.set(packageDir, entry);
        const bootCount = (bootCounts.get(packageDir) ?? 0) + 1;
        bootCounts.set(packageDir, bootCount);
        arm(packageDir, entry);
        return { vitest, bootCount };
      });

    return { get };
  });
