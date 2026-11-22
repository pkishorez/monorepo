import { Effect, Layer, Schema, SubscriptionRef } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Runtime } from '@kestack/kabuki';
import { Preferences, memoryPreferences } from '../../preferences/index.js';
import { Telemetry, type Live } from '../../telemetry/index.js';
import type { OtelSpan } from '../../trace-model/index.js';
import { FeedLive, listingOf } from '../index.js';

/*
 * The Feed in memory, on telemetry the test writes: it lists what arrives,
 * narrows it by the Filters, holds new Traces back while one is open, and
 * remembers its Filters.
 */

const root = (
  traceId: string,
  service: string,
  startTime: number,
): OtelSpan => ({
  traceId,
  spanId: `${traceId}-root`,
  parentSpanId: null,
  name: `GET /${traceId}`,
  startTime,
  endTime: startTime + 10,
  status: 'success',
  attributes: { 'resource.service.name': service },
  events: [],
});

/** A parent that holds the Feed and opens what it picks. */
const Host = Actor.define('Host', {
  model: { opened: Schema.NullOr(Schema.String) },
  message: { Opened: { traceId: Schema.String }, Closed: {} },
});
const HostLive = Host.build({
  init: () => ({ model: { opened: null } }),
  children: {
    feed: Actor.child(FeedLive, {
      props: ({ model }) => ({ opened: model.opened }),
      emits: { Opened: ({ traceId }) => ({ _tag: 'Opened', traceId }) },
    }),
  },
  on: {
    Opened: ({ traceId }) => ({ model: { opened: traceId } }),
    Closed: () => ({ model: { opened: null } }),
  },
});

const start = (preferences = memoryPreferences()) =>
  Effect.gen(function* () {
    const live = yield* SubscriptionRef.make<Live>({ ready: false, spans: [] });
    const layer = Layer.mergeAll(
      Layer.succeed(Telemetry)({
        live: SubscriptionRef.changes(live),
        clear: Effect.succeed(0),
      }),
      Layer.succeed(Preferences)(preferences),
    );
    const app = yield* Runtime.scoped(HostLive, { input: undefined, layer });
    const arrive = (spans: ReadonlyArray<OtelSpan>) =>
      SubscriptionRef.set(live, { ready: true, spans });
    return { app, arrive };
  });

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

describe('the Feed', () => {
  it('lists the Traces that arrive, newest first, and narrows them by service', () =>
    run(
      Effect.gen(function* () {
        const { app, arrive } = yield* start();
        yield* arrive([root('a', 'api', 1), root('b', 'worker', 2)]);
        const feed = yield* app.root.children.feed.until(
          ({ model }) => model.spans.length === 2,
        );
        expect(
          listingOf(feed.model, null).traces.map((trace) => trace.traceId),
        ).toEqual(['b', 'a']);

        feed.send({
          _tag: 'Filtered',
          filters: {
            attributeFilters: [
              { id: '1', key: 'resource.service.name', value: 'api' },
            ],
            sinceNow: null,
            status: 'all',
          },
        });
        const narrowed = yield* app.root.children.feed.until(
          ({ model }) => model.filters.attributeFilters.length === 1,
        );
        expect(
          listingOf(narrowed.model, null).traces.map((trace) => trace.traceId),
        ).toEqual(['a']);
      }),
    ));

  it('holds new Traces back while one is open, until revealed', () =>
    run(
      Effect.gen(function* () {
        const { app, arrive } = yield* start();
        yield* arrive([root('a', 'api', 1)]);
        const feed = yield* app.root.children.feed.until(
          ({ model }) => model.spans.length === 1,
        );
        feed.send({ _tag: 'Picked', traceId: 'a' });
        yield* app.root.until(({ model }) => model.opened === 'a');

        yield* arrive([root('a', 'api', 1), root('b', 'api', 2)]);
        const held = yield* app.root.children.feed.until(
          ({ model }) => model.spans.length === 2,
        );
        const listing = listingOf(held.model, 'a');
        expect(listing.held).toBe(1);
        expect(listing.traces.map((trace) => trace.traceId)).toEqual(['a']);

        held.send({ _tag: 'Revealed' });
        const revealed = yield* app.root.children.feed.until(
          ({ model }) => model.shown.length === 2,
        );
        expect(listingOf(revealed.model, 'a').held).toBe(0);
        expect(
          listingOf(revealed.model, 'a').traces.map((trace) => trace.traceId),
        ).toEqual(['b', 'a']);
      }),
    ));

  it('shows every Trace once the open one is closed', () =>
    run(
      Effect.gen(function* () {
        const { app, arrive } = yield* start();
        yield* arrive([root('a', 'api', 1)]);
        const feed = yield* app.root.children.feed.until(
          ({ model }) => model.spans.length === 1,
        );
        feed.send({ _tag: 'Picked', traceId: 'a' });
        yield* app.root.until(({ model }) => model.opened === 'a');
        yield* arrive([root('a', 'api', 1), root('b', 'api', 2)]);
        yield* app.root.children.feed.until(
          ({ model }) => model.spans.length === 2,
        );
        app.root.send({ _tag: 'Closed' });
        const shown = yield* app.root.children.feed.until(
          ({ props }) => props.opened === null,
        );
        expect(listingOf(shown.model, shown.props.opened).held).toBe(0);
        expect(listingOf(shown.model, shown.props.opened).traces).toHaveLength(
          2,
        );
      }),
    ));

  it('collapses a group on the first toggle', () =>
    run(
      Effect.gen(function* () {
        const { app } = yield* start();
        const feed = yield* app.root.children.feed.until(
          ({ model }) => model.restored,
        );
        feed.send({ _tag: 'Toggled', group: 'api' });
        const toggled = yield* app.root.children.feed.until(
          ({ model }) => 'api' in model.expanded,
        );
        expect(toggled.model.expanded).toEqual({ api: false });
      }),
    ));

  it('remembers its Filters and grouping for the next Feed', () =>
    run(
      Effect.gen(function* () {
        const preferences = memoryPreferences();
        const first = yield* start(preferences);
        const feed = yield* first.app.root.children.feed.until(
          ({ model }) => model.restored,
        );
        feed.send({ _tag: 'Grouped', groupBy: 'http.route' });
        feed.send({
          _tag: 'Filtered',
          filters: { attributeFilters: [], sinceNow: 5, status: 'error' },
        });
        yield* first.app.root.children.feed.until(
          ({ model }) => model.filters.status === 'error',
        );
        yield* Effect.sleep('10 millis');

        const second = yield* start(preferences);
        const restored = yield* second.app.root.children.feed.until(
          ({ model }) => model.restored,
        );
        expect(restored.model.groupBy).toBe('http.route');
        expect(restored.model.filters).toEqual({
          attributeFilters: [],
          sinceNow: 5,
          status: 'error',
        });
      }),
    ));
});
