import { Effect, Layer, Scope, Stream } from 'effect';
import { Actor, Runtime } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import type { Running } from '@kestack/kabuki/core/runtime';
import type { Instance } from '@kestack/kabuki/core/snapshot';
import { describe, expect, it } from 'vitest';
import { ConnectionFilter, connectionFilterMemory } from '../../../store.ts';
import { Preferences, nothing } from '../../../../../store.ts';
import { Connections, nobody } from '../../../connections.ts';
import { Moves } from '../../../connection/records/index.ts';
import { SidebarLive } from '../actor.ts';

/*
 * A Connection's name collapsed in the sidebar: shown at once, kept beside
 * the Connection Filter in the Account's database, and read back as kept by
 * a sidebar drawn again; clicked again, open.
 */

const Owner = Actor.define('Owner', {});
const OwnerLive = Actor.build(Owner, {
  children: {
    sidebar: { actor: SidebarLive, props: () => ({ accountId: 'a1' }) },
  },
});

const layer = Layer.mergeAll(
  connectionFilterMemory(),
  Layer.mock(Moves)({
    intents: Stream.never,
    refusals: Stream.never,
  }),
  Layer.mock(Connections)({
    state: Stream.concat(Stream.make(nobody), Stream.never),
  }),
  Layer.mock(Preferences)({
    read: Effect.succeed(nothing),
    changes: Stream.never,
  }),
  Layer.mock(Navigation)({ push: () => Effect.void }),
);

const start = (provided: Layer.Layer<any>) =>
  Runtime.start(OwnerLive as never, provided as never) as Effect.Effect<
    Running<unknown>,
    never,
    Scope.Scope
  >;
const sidebar = (app: Running<unknown>) =>
  app.snapshot().children['sidebar'] as Instance;
const collapsed = (app: Running<unknown>) =>
  (sidebar(app).model as { collapsed: ReadonlyArray<string> | null }).collapsed;
const toggle = (app: Running<unknown>, connectionId: string) =>
  app.send(sidebar(app).id, {
    _tag: 'CollapseToggled',
    connectionId,
  } as never);

const wait = (ms = 30) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

describe("a Connection's name collapsed", () => {
  it('shows at once, is kept per Account, and opens again', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const built = yield* Layer.build(layer);
          const kept = Layer.succeedContext(built);
          const app = yield* start(kept);
          yield* wait();
          expect(collapsed(app)).toEqual([]);
          toggle(app, 'm2');
          expect(collapsed(app)).toEqual(['m2']);
          yield* wait();
          const filter = yield* Effect.provide(ConnectionFilter, kept);
          expect(yield* filter.collapsed('a1')).toEqual(['m2']);
          expect(yield* filter.collapsed('a2')).toEqual([]);
          // A sidebar drawn again reads it as kept.
          const again = yield* start(kept);
          yield* wait();
          expect(collapsed(again)).toEqual(['m2']);
          toggle(app, 'm2');
          yield* wait();
          expect(yield* filter.collapsed('a1')).toEqual([]);
        }),
      ) as Effect.Effect<void>,
    );
  });
});
