import { Effect } from 'effect';
import {
  clearTelemetry,
  queryLogs,
  queryMetrics,
  queryTraces,
} from '@pkishorez/lotel';
import { DevtoolsRpc, DevtoolsRpcError } from '../rpc/index.js';
import { analyzeLaymosProject } from './analyze-laymos-project/index.js';
import { getTrace } from './get-trace/index.js';

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
  QueryTraces: ({ sk, limit }) =>
    queryTraces(sk, limit).pipe(Effect.mapError(toRpcError)),
  GetTrace: ({ traceId }) =>
    getTrace(traceId).pipe(
      Effect.mapError((cause) =>
        cause._tag === 'TraceNotFound' ? cause : toRpcError(cause),
      ),
    ),
  QueryLogs: ({ sk, limit }) =>
    queryLogs(sk, limit).pipe(Effect.mapError(toRpcError)),
  QueryMetrics: ({ sk, limit }) =>
    queryMetrics(sk, limit).pipe(Effect.mapError(toRpcError)),
  ClearTelemetry: () =>
    clearTelemetry.pipe(
      Effect.map((deleted) => ({ deleted })),
      Effect.mapError(toRpcError),
    ),
  AnalyzeLaymosProject: ({ projectPath }) => analyzeLaymosProject(projectPath),
});
