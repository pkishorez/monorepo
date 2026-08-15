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

  it('indexes Flow spans and logs and returns one ordered Flow', async () => {
    const flow = await run(
      withClient((client) =>
        Effect.gen(function* () {
          yield* client.SaveSpans({
            records: [
              {
                traceId: 'trace-client',
                spanId: 'span-offer',
                span: {
                  name: 'Create offer',
                  startTimeUnixNano: '100',
                  endTimeUnixNano: '130',
                  attributes: [
                    {
                      key: 'flow.id',
                      value: { stringValue: 'call-123' },
                    },
                    {
                      key: 'flow.participant.name',
                      value: { stringValue: 'client-a' },
                    },
                  ],
                },
                context: {},
              },
              {
                traceId: 'trace-server',
                spanId: 'span-forward',
                span: {
                  name: 'Forward offer',
                  startTimeUnixNano: '200',
                  endTimeUnixNano: '240',
                  attributes: [
                    {
                      key: 'flow.id',
                      value: { stringValue: 'call-123' },
                    },
                    {
                      key: 'flow.participant.name',
                      value: { stringValue: 'server' },
                    },
                  ],
                },
                context: {},
              },
            ],
          });
          yield* client.InsertLogs({
            records: [
              {
                traceId: null,
                spanId: null,
                log: {
                  timeUnixNano: '150',
                  body: { stringValue: 'Offer ready' },
                  attributes: [
                    {
                      key: 'flow.id',
                      value: { stringValue: 'call-123' },
                    },
                    {
                      key: 'flow.participant.name',
                      value: { stringValue: 'client-a' },
                    },
                    {
                      key: 'flow.item.type',
                      value: { stringValue: 'message' },
                    },
                    {
                      key: 'flow.message.to',
                      value: { stringValue: 'server' },
                    },
                  ],
                },
                context: {},
              },
              {
                traceId: null,
                spanId: null,
                log: {
                  timeUnixNano: '300',
                  body: { stringValue: 'Activation completed' },
                  attributes: [
                    {
                      key: 'flow.id',
                      value: { stringValue: 'call-123' },
                    },
                    {
                      key: 'flow.participant.name',
                      value: { stringValue: 'server' },
                    },
                    {
                      key: 'flow.item.type',
                      value: { stringValue: 'activation-end' },
                    },
                    {
                      key: 'flow.activation.outcome',
                      value: { stringValue: 'completed' },
                    },
                  ],
                },
                context: {},
              },
            ],
          });

          return yield* client.GetFlow({ flowId: 'call-123' });
        }),
      ),
    );

    expect(flow).toMatchObject({ id: 'call-123', latestTimestamp: 0.0003 });
    expect(flow.items.map(({ kind, name }) => [kind, name])).toEqual([
      ['activity', 'Create offer'],
      ['message', 'Offer ready'],
      ['activity', 'Forward offer'],
      ['activation-end', 'Activation completed'],
    ]);
    expect(flow.warnings.map(({ message }) => message)).toEqual([
      'Activation ended while none was open.',
    ]);
  });

  it('warns about invalid Flow items', async () => {
    const flow = await run(
      withClient((client) =>
        Effect.gen(function* () {
          yield* client.InsertLogs({
            records: [
              {
                traceId: null,
                spanId: null,
                log: {
                  timeUnixNano: '10',
                  attributes: [
                    {
                      key: 'flow.id',
                      value: { stringValue: 'invalid-flow' },
                    },
                  ],
                },
                context: {},
              },
              {
                traceId: null,
                spanId: null,
                log: {
                  timeUnixNano: '20',
                  attributes: [
                    {
                      key: 'flow.id',
                      value: { stringValue: 'invalid-flow' },
                    },
                    {
                      key: 'flow.participant.name',
                      value: { stringValue: 'server' },
                    },
                  ],
                },
                context: {},
              },
            ],
          });
          return yield* client.GetFlow({ flowId: 'invalid-flow' });
        }),
      ),
    );

    expect(flow.latestTimestamp).toBe(0.00002);
    expect(flow.items).toHaveLength(1);
    expect(flow.warnings).toHaveLength(1);
  });

  it('lists Flow entities for the Flow catalog', async () => {
    const flows = await run(
      withClient((client) =>
        Effect.gen(function* () {
          yield* client.InsertLogs({
            records: [
              {
                traceId: null,
                spanId: null,
                log: {
                  timeUnixNano: '10',
                  attributes: [
                    {
                      key: 'flow.id',
                      value: { stringValue: 'listed-flow' },
                    },
                    {
                      key: 'flow.participant.name',
                      value: { stringValue: 'client-a' },
                    },
                  ],
                },
                context: {},
              },
            ],
          });
          return yield* client.ListFlows({ _u: { '>': null } });
        }),
      ),
    );

    expect(flows.items.map(({ value }) => value.flowId)).toEqual([
      'listed-flow',
    ]);
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
});
