import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { BadRequestError, InternalError, LotelApi } from '../http-api/index.js';
import {
  clearTelemetry,
  ingestLogs,
  ingestMetrics,
  ingestTraces,
  isLogsRequest,
  isMetricsRequest,
  isTraceRequest,
  queryLogs,
  queryMetrics,
  queryTraces,
} from '../orchestration/index.js';

const success = (accepted: number) => ({
  partialSuccess: {},
  accepted,
});

export const LotelHandlersLive = HttpApiBuilder.group(
  LotelApi,
  'lotel',
  (handlers) =>
    handlers
      .handle('ingestTraces', ({ payload }) =>
        Effect.gen(function* () {
          if (!isTraceRequest(payload)) {
            return yield* Effect.fail(
              BadRequestError.badRequest(
                'ingestTraces',
                'expected resourceSpans array',
              ),
            );
          }
          const accepted = yield* ingestTraces(payload).pipe(
            Effect.mapError(InternalError.fromSqlite('ingestTraces')),
          );
          return success(accepted);
        }),
      )
      .handle('ingestLogs', ({ payload }) =>
        Effect.gen(function* () {
          if (!isLogsRequest(payload)) {
            return yield* Effect.fail(
              BadRequestError.badRequest(
                'ingestLogs',
                'expected resourceLogs array',
              ),
            );
          }
          const accepted = yield* ingestLogs(payload).pipe(
            Effect.mapError(InternalError.fromSqlite('ingestLogs')),
          );
          return success(accepted);
        }),
      )
      .handle('ingestMetrics', ({ payload }) =>
        Effect.gen(function* () {
          if (!isMetricsRequest(payload)) {
            return yield* Effect.fail(
              BadRequestError.badRequest(
                'ingestMetrics',
                'expected resourceMetrics array',
              ),
            );
          }
          const accepted = yield* ingestMetrics(payload).pipe(
            Effect.mapError(InternalError.fromSqlite('ingestMetrics')),
          );
          return success(accepted);
        }),
      )
      .handle('queryTraces', ({ urlParams: { cursor } }) =>
        queryTraces(cursor).pipe(
          Effect.mapError(InternalError.fromSqlite('queryTraces')),
        ),
      )
      .handle('queryLogs', ({ urlParams: { cursor } }) =>
        queryLogs(cursor).pipe(
          Effect.mapError(InternalError.fromSqlite('queryLogs')),
        ),
      )
      .handle('queryMetrics', ({ urlParams: { cursor } }) =>
        queryMetrics(cursor).pipe(
          Effect.mapError(InternalError.fromSqlite('queryMetrics')),
        ),
      )
      .handle('clearTelemetry', () =>
        clearTelemetry.pipe(
          Effect.map((deleted) => ({ deleted })),
          Effect.mapError(InternalError.fromSqlite('clearTelemetry')),
        ),
      ),
);
