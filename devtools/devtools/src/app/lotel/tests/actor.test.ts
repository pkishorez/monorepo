import { Effect, Layer, Stream } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import { LotelRpcError } from '../contract/index.js';
import { Preferences, memoryPreferences } from '../preferences/index.js';
import { Telemetry, type TelemetryService } from '../telemetry/index.js';
import type { OtelSpan } from '../trace-model/index.js';
import { LotelLive } from '../index.js';

/*
 * The Lotel Tool in memory, on telemetry the test gives: a Trace the Feed
 * picks opens beside it and closes again, its layout outlives it, and
 * clearing waits for a confirmation and closes the Trace open.
 */

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
  preferences = memoryPreferences(),
) =>
  Runtime.scoped(LotelLive, {
    input: {},
    layer: Layer.mergeAll(
      Layer.succeed(Telemetry)({
        live: Stream.make({ ready: true, spans: [span] }).pipe(
          Stream.concat(Stream.never),
        ),
        clear,
      }),
      Layer.succeed(Preferences)(preferences),
    ),
  });

const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

/** The app once the Feed has the Span and the Trace it makes is open. */
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
        const preferences = memoryPreferences();
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
        const app = yield* start(
          Effect.fail(new LotelRpcError({ message: 'disk full' })),
        );
        yield* app.root.until(({ model }) => model.restored);
        app.root.send({ _tag: 'ClearAsked' });
        app.root.send({ _tag: 'ClearConfirmed' });
        // Back to asking once the Command has failed, not left clearing.
        yield* Effect.sleep('10 millis');
        expect(app.root.model.clearing).toBe('confirming');
      }),
    ));
});
