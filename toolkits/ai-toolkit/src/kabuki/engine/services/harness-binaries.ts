import { Clock, Data, Effect, Layer } from 'effect';
import {
  HarnessBinaries,
  type BinaryInfo,
  type Harness,
} from '../../../services/harness/contract/index.js';
import type { HarnessName } from '../../../services/records/raw/index.js';
import { Store } from '../../../services/records/store/index.js';
import { expand, whyNotExecutable } from './executable.js';

/*
 * Which Harness Binary each harness runs: a path the user set, kept in the
 * Store, or the harness's own default. Every harness call reads it afresh,
 * so a change applies to the next process a harness starts. A path is kept
 * only once it runs: it exists, may be executed, and the harness reads a
 * version from it.
 */

export class InvalidBinary extends Data.TaggedError('InvalidBinary')<{
  readonly message: string;
}> {}

/** A harness's Harness Binary: the path set for it, and what it resolved to. */
export interface HarnessBinaryRow {
  readonly harness: HarnessName;
  /** null runs the harness's default. */
  readonly configuredPath: string | null;
  readonly resolved: BinaryInfo;
}

const configured = (harness: HarnessName) =>
  Effect.flatMap(Store, (store) =>
    Effect.map(
      store.harnessConfig(harness),
      (config) => config?.binaryPath ?? null,
    ),
  );

/** The Harness Binaries as the Store holds them, read on every call. */
export const storedHarnessBinaries: Layer.Layer<HarnessBinaries, never, Store> =
  Layer.effect(
    HarnessBinaries,
    Effect.map(Effect.context<Store>(), (context) => ({
      path: (harness: HarnessName) =>
        configured(harness).pipe(
          Effect.map((path) => path ?? undefined),
          Effect.provideContext(context),
        ),
    })),
  );

/** `harness.binary`, as if `path` were set for it. */
const probe = (harness: Harness, path: string | null) =>
  harness.binary.pipe(
    Effect.provideService(HarnessBinaries, {
      path: () => Effect.succeed(path ?? undefined),
    }),
  );

const rowOf = (harness: Harness, path: string | null) =>
  Effect.map(probe(harness, path), (resolved): HarnessBinaryRow => ({
    harness: harness.name,
    configuredPath: path,
    resolved,
  }));

/** Why a path cannot be this harness's binary, or null when it runs. */
const check = (harness: Harness, path: string) =>
  Effect.gen(function* () {
    const notExecutable = yield* whyNotExecutable(path);
    if (notExecutable !== null) return notExecutable;
    const info = yield* probe(harness, path);
    if (info.error !== null) return info.error;
    if (info.version === null) return `${path} did not say which version it is`;
    return null;
  });

/** A harness's Harness Binary as it stands. */
export const binaryRow = (harness: Harness) =>
  Effect.flatMap(configured(harness.name), (path) => rowOf(harness, path));

/** Sets a harness's Harness Binary once it runs; null goes back to the default. */
export const setBinary = (harness: Harness, given: string | null) =>
  Effect.gen(function* () {
    const path = given === null ? null : expand(given.trim());
    if (path !== null) {
      const why = yield* check(harness, path);
      if (why !== null) return yield* new InvalidBinary({ message: why });
    }
    const store = yield* Store;
    yield* store.saveHarnessConfig({
      id: harness.name,
      harness: harness.name,
      binaryPath: path,
      updatedAt: yield* Clock.currentTimeMillis,
    });
    return yield* rowOf(harness, path);
  });
