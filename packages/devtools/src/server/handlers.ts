import { existsSync } from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { assembleDepcruise, resolvePath } from '../report/assemble.js';
import { DevtoolsRpc } from '../rpc/index.js';

/** Live handlers for the {@link DevtoolsRpc} group. */
export const DevtoolsHandlersLive = DevtoolsRpc.toLayer({
  RunDepcruise: ({ path: input }) =>
    Effect.gen(function* () {
      const dir = resolvePath(input);
      if (!existsSync(path.join(dir, 'depcruise.config.ts'))) {
        return { available: false as const };
      }
      return yield* assembleDepcruise(dir);
    }),
});
