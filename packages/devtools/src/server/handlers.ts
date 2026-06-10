import { existsSync } from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import {
  assembleDepcruise,
  assembleVtestDocs,
  assembleVtestRun,
  resolvePath,
  toError,
} from '../report/assemble.js';
import { DevtoolsRpc } from '../rpc/index.js';

/** Live handlers for the {@link DevtoolsRpc} group. */
export const DevtoolsHandlersLive = DevtoolsRpc.toLayer({
  RunVtestDocs: ({ path: input }) =>
    Effect.gen(function* () {
      const dir = resolvePath(input);
      if (!existsSync(path.join(dir, 'vtest'))) {
        return { available: false as const };
      }
      return yield* assembleVtestDocs(dir).pipe(Effect.mapError(toError));
    }),
  RunVtestRun: ({ path: input }) =>
    Effect.gen(function* () {
      const dir = resolvePath(input);
      if (!existsSync(path.join(dir, 'vtest'))) {
        return { available: false as const };
      }
      return yield* assembleVtestRun(dir).pipe(Effect.mapError(toError));
    }),
  RunDepcruise: ({ path: input }) =>
    Effect.gen(function* () {
      const dir = resolvePath(input);
      if (!existsSync(path.join(dir, 'depcruise.config.ts'))) {
        return { available: false as const };
      }
      return yield* assembleDepcruise(dir);
    }),
});
