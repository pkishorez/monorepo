import { Clock, Effect, Layer } from 'effect';
import {
  binaryAt,
  checkBinary,
  HarnessBinaries,
  type Harness,
} from '@kestack/ai-toolkit/harness';
import type { BinaryInfo, HarnessName } from '@kestack/ai-toolkit/contract';
import { Store } from '../../capabilities/index.js';

/*
 * Which Harness Binary each harness runs: a path the user set, kept in the
 * Store, or the harness's own default. Every harness call reads it afresh,
 * so a change applies to the next process a harness starts. A path is kept
 * only once ai-toolkit's `checkBinary` says it runs.
 */

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

const rowOf = (harness: Harness, path: string | null) =>
  Effect.map(binaryAt(harness, path), (resolved): HarnessBinaryRow => ({
    harness: harness.name,
    configuredPath: path,
    resolved,
  }));

/** A harness's Harness Binary as it stands. */
export const binaryRow = (harness: Harness) =>
  Effect.flatMap(configured(harness.name), (path) => rowOf(harness, path));

/** Sets a harness's Harness Binary once it runs; null goes back to the default. */
export const setBinary = (harness: Harness, given: string | null) =>
  Effect.gen(function* () {
    const path = given === null ? null : yield* checkBinary(harness, given);
    const store = yield* Store;
    yield* store.saveHarnessConfig({
      id: harness.name,
      harness: harness.name,
      binaryPath: path,
      updatedAt: yield* Clock.currentTimeMillis,
    });
    return yield* rowOf(harness, path);
  });
