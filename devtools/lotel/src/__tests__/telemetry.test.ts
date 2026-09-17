import { Effect } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import { describe, expect, it } from 'vitest';
import { LotelRpc, LotelRpcLive, sqliteTelemetryStoreLayer } from '../index.js';
import {
  LogEntitySchema,
  SpanEntitySchema,
} from '../domain/telemetry-schema/index.js';
import { makeSqliteTelemetryStore } from '../services/telemetry-store/sqlite/index.js';

const run = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(effect);

const withClient = <A, E, R>(
  use: (
    client: Effect.Success<
      ReturnType<typeof RpcTest.makeClient<typeof LotelRpc>>
    >,
  ) => Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(LotelRpc);
      return yield* use(client);
    }),
  ).pipe(
    Effect.provide(LotelRpcLive),
    Effect.provide(sqliteTelemetryStoreLayer({ path: ':memory:' })),
  );

describe('lotel', () => {
  it('returns all Span Records when a read has no limit', async () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
      traceId: 'large-trace',
      spanId: `span-${String(index).padStart(3, '0')}`,
      span: {},
      context: {},
    }));

    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeSqliteTelemetryStore(':memory:');
          const saved = yield* store.saveSpans(records);
          const byTrace = yield* store.findSpansByTrace('large-trace');
          const listed = yield* store.listSpans({ '>': null });
          return { saved, byTrace, listed };
        }),
      ),
    );

    expect(result.saved).toEqual({ accepted: 101, rejected: 0 });
    expect(result.byTrace).toHaveLength(101);
    expect(result.listed.items).toHaveLength(101);
  });

  it('migrates telemetry records written before Flow fields existed', async () => {
    const [span, log] = await run(
      Effect.all([
        SpanEntitySchema.decode({
          _v: 'v1',
          traceId: 'legacy-trace',
          spanId: 'legacy-span',
          span: {},
          context: {},
        }),
        LogEntitySchema.decode({
          _v: 'v1',
          id: 'legacy-log',
          traceId: 'legacy-trace',
          spanId: 'legacy-span',
          log: {},
          context: {},
        }),
      ]),
    );

    expect(span).toMatchObject({ flowId: null, participantName: null });
    expect(log).toMatchObject({ flowId: null, participantName: null });
  });

  it('lists an updated span after the previous update cursor', async () => {
    const result = await run(
      withClient((client) =>
        Effect.gen(function* () {
          const first = yield* client.SaveSpans({
            records: [
              {
                traceId: 'trace-1',
                spanId: 'span-1',
                span: { name: 'first', startTimeUnixNano: '100' },
                context: {},
              },
            ],
          });
          const initial = yield* client.ListSpans({
            _u: { '>': null },
            limit: 10,
          });
          const cursor = initial.items[0]!.meta._u;

          const second = yield* client.SaveSpans({
            records: [
              {
                traceId: 'trace-1',
                spanId: 'span-1',
                span: { name: 'updated', startTimeUnixNano: '100' },
                context: {},
              },
            ],
          });
          const updated = yield* client.ListSpans({
            _u: { '>': cursor },
            limit: 10,
          });

          return { first, second, initial, updated };
        }),
      ),
    );

    expect(result.first).toEqual({ accepted: 1, rejected: 0 });
    expect(result.second).toEqual({ accepted: 1, rejected: 0 });
    expect(result.initial.items).toHaveLength(1);
    expect(result.updated.items).toHaveLength(1);
    expect(result.updated.items[0]!.value.span.name).toBe('updated');
  });

  it('assigns log ids and includes correlated logs in trace details', async () => {
    const trace = await run(
      withClient((client) =>
        Effect.gen(function* () {
          yield* client.SaveSpans({
            records: [
              {
                traceId: 'trace-1',
                spanId: 'span-1',
                span: { name: 'span', startTimeUnixNano: '100' },
                context: {
                  resource: {
                    attributes: [
                      {
                        key: 'service.name',
                        value: { stringValue: 'service' },
                      },
                    ],
                  },
                },
              },
            ],
          });
          yield* client.InsertLogs({
            records: [
              {
                traceId: 'trace-1',
                spanId: null,
                log: {
                  timeUnixNano: '110',
                  body: { stringValue: 'hello' },
                },
                context: {},
              },
            ],
          });
          return yield* client.GetTrace({ traceId: 'trace-1' });
        }),
      ),
    );

    expect(trace.spans).toHaveLength(1);
    expect(trace.logs).toHaveLength(1);
    expect(trace.logs[0]!.value.id).toHaveLength(26);
    expect(trace.logs[0]!.value.log.body).toEqual({ stringValue: 'hello' });
  });

  it('does not create a trace from logs alone', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        withClient((client) =>
          Effect.gen(function* () {
            yield* client.InsertLogs({
              records: [
                {
                  traceId: 'trace-1',
                  spanId: null,
                  log: { body: { stringValue: 'orphan' } },
                  context: {},
                },
              ],
            });
            return yield* client.GetTrace({ traceId: 'trace-1' });
          }),
        ),
      ),
    );

    expect(error).toMatchObject({ _tag: 'TraceNotFound', traceId: 'trace-1' });
  });

  it('clears spans and logs together', async () => {
    const result = await run(
      withClient((client) =>
        Effect.gen(function* () {
          yield* client.SaveSpans({
            records: [
              {
                traceId: 'trace-1',
                spanId: 'span-1',
                span: {},
                context: {},
              },
            ],
          });
          yield* client.InsertLogs({
            records: [
              {
                traceId: null,
                spanId: null,
                log: {},
                context: {},
              },
            ],
          });
          const cleared = yield* client.ClearTelemetry({});
          const spans = yield* client.ListSpans({ _u: { '>': null } });
          const logs = yield* client.ListLogs({ _u: { '>': null } });
          return { cleared, spans, logs };
        }),
      ),
    );

    expect(result.cleared).toEqual({ deleted: 2 });
    expect(result.spans.items).toEqual([]);
    expect(result.logs.items).toEqual([]);
  });

  it('lists recent Trace Summaries newest first', async () => {
    const service = (name: string) => ({
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: name } }],
      },
    });
    const result = await run(
      withClient((client) =>
        Effect.gen(function* () {
          yield* client.SaveSpans({
            records: [
              {
                traceId: 'trace-old',
                spanId: 'old-root',
                span: {
                  name: 'GET /old',
                  startTimeUnixNano: '1000',
                  endTimeUnixNano: '1500',
                },
                context: service('api'),
              },
              {
                traceId: 'trace-old',
                spanId: 'old-child',
                span: {
                  name: 'db.query',
                  parentSpanId: 'old-root',
                  startTimeUnixNano: '1100',
                  endTimeUnixNano: '1200',
                  status: { code: 2, message: 'boom' },
                },
                context: service('api'),
              },
            ],
          });
          yield* client.SaveSpans({
            records: [
              {
                traceId: 'trace-new',
                spanId: 'new-root',
                span: { name: 'POST /new', startTimeUnixNano: '2000' },
                context: service('worker'),
              },
            ],
          });
          const all = yield* client.ListTraces({});
          const one = yield* client.ListTraces({ limit: 1 });
          return { all, one };
        }),
      ),
    );

    expect(result.all.items).toEqual([
      {
        traceId: 'trace-new',
        name: 'POST /new',
        serviceName: 'worker',
        startTimeUnixNano: '2000',
        endTimeUnixNano: null,
        spanCount: 1,
        errorCount: 0,
        running: true,
      },
      {
        traceId: 'trace-old',
        name: 'GET /old',
        serviceName: 'api',
        startTimeUnixNano: '1000',
        endTimeUnixNano: '1500',
        spanCount: 2,
        errorCount: 1,
        running: false,
      },
    ]);
    expect(result.one.items.map((item) => item.traceId)).toEqual(['trace-new']);
  });
});
