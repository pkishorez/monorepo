import { existsSync } from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import {
  clearTelemetry,
  queryLogs,
  queryMetrics,
  queryTraces,
} from '@kishorez/lotel';
import { assembleDepcruise, resolvePath } from '../report/assemble.js';
import { DevtoolsRpc, DevtoolsRpcError } from '../rpc/index.js';

const toRpcError = (cause: unknown): DevtoolsRpcError =>
  cause instanceof DevtoolsRpcError
    ? cause
    : new DevtoolsRpcError({ message: String(cause) });

/**
 * Live handlers for the {@link DevtoolsRpc} group. The telemetry read
 * procedures call lotel's orchestration and therefore require the lotel `Db`,
 * which is provided by the server entrypoint.
 */
export const DevtoolsHandlersLive = DevtoolsRpc.toLayer({
  RunDepcruise: ({ path: input }) =>
    Effect.gen(function* () {
      const dir = resolvePath(input);
      if (!existsSync(path.join(dir, 'depcruise.config.ts'))) {
        return { available: false as const };
      }
      return yield* assembleDepcruise(dir);
    }),
  QueryTraces: ({ sk, limit }) =>
    queryTraces(sk, limit).pipe(Effect.mapError(toRpcError)),
  QueryLogs: ({ sk, limit }) =>
    queryLogs(sk, limit).pipe(Effect.mapError(toRpcError)),
  QueryMetrics: ({ sk, limit }) =>
    queryMetrics(sk, limit).pipe(Effect.mapError(toRpcError)),
  ClearTelemetry: () =>
    clearTelemetry.pipe(
      Effect.map((deleted) => ({ deleted })),
      Effect.mapError(toRpcError),
    ),
});
