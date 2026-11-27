import { Effect, Layer, Stream } from 'effect';
import type { Scope } from 'effect';
import { RpcClientError } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import { Preferences } from '../../../services/preferences/contract/index.js';
import { fakePreferences } from '../../../services/preferences/fake/index.js';
import {
  Telemetry,
  type OtelSpan,
  type TelemetryService,
} from '../../services/telemetry/contract/index.js';
import { Toasts } from '../../services/toasts/contract/index.js';
import { fakeToasts } from '../../services/toasts/fake/index.js';
import { Lotel } from '../index.js';

const span: OtelSpan = {
  traceId: 'trace-1',
  spanId: 'root',
  parentSpanId: null,
  name: 'GET /users',
  startTime: 1,
  endTime: 2,
  status: 'success',
  attributes: {},
  events: [],
};

const start = (
  clear: TelemetryService['clear'] = Effect.succeed(3),
  preferences = fakePreferences(),
  toasts = fakeToasts().toasts,
) =>
  Runtime.scoped(Lotel, {
    input: {},
    layer: Layer.mergeAll(
      Layer.succeed(Telemetry)({
        live: Stream.make({ ready: true, spans: [span] }).pipe(
          Stream.concat(Stream.never),
        ),
        clear,
      }),
      Layer.succeed(Preferences)(preferences),
      Layer.succeed(Toasts)(toasts),
    ),
  });

const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const opened = (app: Effect.Success<ReturnType<typeof start>>) =>
  Effect.gen(function* () {
    const feed = yield* app.root.children.feed.until(
      ({ model }) => model.spans.length > 0,
    );
    feed.send({ _tag: 'Picked', traceId: 'trace-1' });
    return yield* app.root.until(
      ({ children }) => children.trace !== undefined,
    );
  });

describe('the Lotel Tool', () => {
  it('opens the Trace the Feed picks, and closes it', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start();
        const lotel = yield* opened(app);
        const trace = yield* lotel.children.trace!.until(
          ({ model }) => model.spans.length > 0,
        );
        trace.send({ _tag: 'Closed' });
        const closed = yield* app.root.until(
          ({ children }) => children.trace === undefined,
        );
        expect(closed.model.opened).toBeNull();
      }),
    ));

  it('keeps how a Trace is laid out for the next one, and across a reload', () =>
    run(
      Effect.gen(function* () {
        const preferences = fakePreferences();
        const app = yield* start(undefined, preferences);
        const lotel = yield* opened(app);
        lotel.children.trace!.send({
          _tag: 'LaidOut',
          layout: { ...lotel.model.layout, view: 'narrative' },
        });
        yield* app.root.until(({ model }) => model.layout.view === 'narrative');
        yield* Effect.sleep('10 millis');

        const reloaded = yield* start(undefined, preferences);
        const restored = yield* reloaded.root.until(
          ({ model }) => model.restored,
        );
        expect(restored.model.layout.view).toBe('narrative');
      }),
    ));

  it('clears only once confirmed, and closes the Trace open', () =>
    run(
      Effect.gen(function* () {
        let cleared = 0;
        const app = yield* start(Effect.sync(() => (cleared += 1)));
        yield* opened(app);

        app.root.send({ _tag: 'ClearAsked' });
        yield* app.root.until(({ model }) => model.clearing === 'confirming');
        app.root.send({ _tag: 'ClearDismissed' });
        yield* app.root.until(({ model }) => model.clearing === 'idle');
        expect(cleared).toBe(0);

        app.root.send({ _tag: 'ClearAsked' });
        app.root.send({ _tag: 'ClearConfirmed' });
        const after = yield* app.root.until(
          ({ model }) => model.clearing === 'idle' && model.opened === null,
        );
        expect(cleared).toBe(1);
        expect(after.children.trace).toBeUndefined();
      }),
    ));

  it('keeps asking when clearing fails', () =>
    run(
      Effect.gen(function* () {
        const toasts = fakeToasts();
        const app = yield* start(
          Effect.fail(
            new RpcClientError.RpcClientError({
              reason: new RpcClientError.RpcClientDefect({
                message: 'disk full',
                cause: null,
              }),
            }),
          ),
          undefined,
          toasts.toasts,
        );
        yield* app.root.until(({ model }) => model.restored);
        app.root.send({ _tag: 'ClearAsked' });
        app.root.send({ _tag: 'ClearConfirmed' });
        yield* Effect.sleep('10 millis');
        expect(app.root.model.clearing).toBe('confirming');
        expect(toasts.shown).toEqual([
          {
            type: 'error',
            title: 'Could not clear telemetry',
            description: 'RpcClientDefect: disk full',
          },
        ]);
      }),
    ));
});
