import { Clock, Effect } from 'effect';
import type { Failed, Stepped } from '../../../rpc/session/contract/index.ts';
import { newFailures } from './look.ts';

export interface Patience {
  readonly quiet: number;
  readonly most: number;
  readonly every: number;
}

export const PATIENCE: Patience = { quiet: 250, most: 5_000, every: 50 };

export interface Read {
  readonly stepped: Stepped;
  readonly changed: number | null;
}

export interface Settling {
  readonly stepped: Stepped;
  readonly settled: boolean;
  readonly waited: number;
  readonly failed: ReadonlyArray<Failed>;
}

export const settle = <E>(
  read: Effect.Effect<Read, E>,
  known: ReadonlySet<string>,
  { quiet, most, every }: Patience = PATIENCE,
): Effect.Effect<Settling, E> =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeMillis;
    let still:
      | { readonly changed: number | null; readonly since: number }
      | undefined;
    while (true) {
      const { stepped, changed } = yield* read;
      const now = yield* Clock.currentTimeMillis;
      const waited = now - start;
      const failed = newFailures(stepped.work, known);
      if (failed.length > 0) return { stepped, settled: false, waited, failed };
      if (stepped.work?.settled !== true) still = undefined;
      else if (still === undefined || still.changed !== changed)
        still = { changed, since: now };
      else if (now - still.since >= quiet)
        return { stepped, settled: true, waited, failed };
      if (waited >= most) return { stepped, settled: false, waited, failed };
      yield* Effect.sleep(every);
    }
  });
