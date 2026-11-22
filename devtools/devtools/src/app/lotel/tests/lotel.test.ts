import { Effect, Layer, Stream } from 'effect';
import { FetchHttpClient, HttpRouter } from 'effect/http';
import { NodeHttpServer } from '@effect/platform-node';
import { afterEach, describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import { Preferences, memoryPreferences } from '../preferences/index.js';
import { lotelEndpoints, lotelServer } from '../server/index.js';
import { Telemetry, telemetryLayer } from '../telemetry/index.js';
import { LotelLive } from '../index.js';

/*
 * The Lotel Tool end to end, in memory: an exporter posts OTLP to the
 * server door, and the browser door's Telemetry, talking to the same
 * server over its Lotel RPC, sees it live; clearing empties both.
 */

const ORIGIN = 'http://devtools.test';

const handlers: Array<{ dispose: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(handlers.splice(0).map((each) => each.dispose()));
});

/** The Lotel server door on a fresh in-memory store, as a `fetch`. */
const serve = () => {
  const web = HttpRouter.toWebHandler(
    lotelServer({ db: ':memory:' }).pipe(
      Layer.provide(NodeHttpServer.layerHttpServices),
    ),
    { disableLogger: true },
  );
  handlers.push(web);
  const fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    web.handler(new Request(input, init));
  return fetch as typeof globalThis.fetch;
};

const otlpTrace = {
  resourceSpans: [
    {
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: 'api' } }],
      },
      scopeSpans: [
        {
          spans: [
            {
              traceId: 'trace-1',
              spanId: 'root',
              name: 'GET /users',
              startTimeUnixNano: '1000000000',
              endTimeUnixNano: '1500000000',
            },
          ],
        },
      ],
    },
  ],
};

const otlpLog = {
  resourceLogs: [
    {
      scopeLogs: [
        {
          logRecords: [
            {
              traceId: 'trace-1',
              spanId: 'root',
              timeUnixNano: '1100000000',
              body: { stringValue: 'looked the users up' },
            },
          ],
        },
      ],
    },
  ],
};

const post = (fetch: typeof globalThis.fetch, path: string, body: object) =>
  fetch(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** The browser door's Telemetry, over `fetch` rather than the network. */
const telemetryOver = (fetch: typeof globalThis.fetch) =>
  telemetryLayer(ORIGIN).pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch)(fetch)),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, Telemetry>,
  fetch: typeof globalThis.fetch,
) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(telemetryOver(fetch))),
  );

/** The first Live value that passes `test`. */
const liveUntil = (test: (spans: number, ready: boolean) => boolean) =>
  Effect.flatMap(Telemetry, (telemetry) =>
    telemetry.live.pipe(
      Stream.filter(({ spans, ready }) => test(spans.length, ready)),
      Stream.runHead,
      Effect.map((head) => (head._tag === 'Some' ? head.value : undefined)),
      Effect.timeout('5 seconds'),
    ),
  );

describe('the Lotel Tool', () => {
  it('names every route it serves', () => {
    expect(Object.keys(lotelEndpoints).sort()).toEqual([
      '/rpc/lotel',
      '/v1/logs',
      '/v1/traces',
    ]);
  });

  it('accepts OTLP and answers it over the Lotel RPC, live', async () => {
    const fetch = serve();
    const traces = await post(fetch, '/v1/traces', otlpTrace);
    expect(traces.status).toBe(200);
    expect(await traces.json()).toEqual({
      partialSuccess: { rejectedSpans: 0 },
    });
    expect((await post(fetch, '/v1/logs', otlpLog)).status).toBe(200);

    const live = await run(
      liveUntil((spans, ready) => ready && spans > 0),
      fetch,
    );
    expect(live?.spans).toHaveLength(1);
    const [span] = live!.spans;
    expect(span).toMatchObject({
      traceId: 'trace-1',
      spanId: 'root',
      name: 'GET /users',
      startTime: 1000,
      endTime: 1500,
      status: 'unset',
    });
    expect(span!.attributes['resource.service.name']).toBe('api');
    // The Log Record that names the Span sits under it.
    expect(span!.events).toEqual([
      expect.objectContaining({
        timestamp: 1100,
        attributes: expect.objectContaining({ body: 'looked the users up' }),
      }),
    ]);
  });

  it('rejects a body that is not an OTLP export', async () => {
    const fetch = serve();
    const response = await post(fetch, '/v1/traces', { resourceSpans: 1 });
    expect(response.status).toBe(400);
  });

  it('clears the server, and the live telemetry starts over empty', async () => {
    const fetch = serve();
    await post(fetch, '/v1/traces', otlpTrace);

    const after = await run(
      Effect.gen(function* () {
        yield* liveUntil((spans) => spans > 0);
        const deleted = yield* (yield* Telemetry).clear;
        const live = yield* liveUntil((spans, ready) => ready && spans === 0);
        return { deleted, live };
      }),
      fetch,
    );
    expect(after.deleted).toBe(1);
    expect(after.live?.spans).toEqual([]);
  });

  it('runs as an app of its own, its Feed opening a Trace', async () => {
    const fetch = serve();
    await post(fetch, '/v1/traces', otlpTrace);
    const layer = Layer.mergeAll(
      telemetryOver(fetch),
      Layer.succeed(Preferences)(memoryPreferences()),
    );

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const app = yield* Runtime.scoped(LotelLive, { input: {}, layer });
          const feed = app.root.children.feed;
          yield* feed.until(
            ({ model }) => model.ready && model.spans.length > 0,
          );
          feed.send({ _tag: 'Picked', traceId: 'trace-1' });
          const opened = yield* app.root.until(
            ({ children }) => children.trace !== undefined,
          );
          expect(opened.model.opened).toBe('trace-1');
          // The Trace opened watches its own Spans.
          const trace = yield* opened.children.trace!.until(
            ({ model }) => model.spans.length > 0,
          );
          expect(trace.model.spans.map((span) => span.spanId)).toEqual([
            'root',
          ]);
        }).pipe(Effect.timeout('5 seconds')),
      ),
    );
  });
});
