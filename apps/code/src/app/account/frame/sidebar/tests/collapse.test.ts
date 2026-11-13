import { Effect, Layer, Scope, Stream } from 'effect';
import { Actor, Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';
import { Navigation } from '@kestack/kabuki/routing';
import { describe, expect, it } from 'vitest';
import { ConnectionFilter, connectionFilterMemory } from '../../store.ts';
import { Preferences, nothing } from '../../../../storage/index.ts';
import { Connections, nobody } from '../../../account.ts';
import { Moves } from '../../../connection/records/index.ts';
import { SidebarLive } from '../actor.ts';

/*
 * A Connection's name collapsed in the sidebar: shown at once, kept beside
 * the Connection Filter in the Account's database, and read back as kept by
 * a sidebar drawn again; clicked again, open.
 */

const Owner = Actor.define('Owner', {});
const OwnerLive = Owner.build({
  children: {
    sidebar: Actor.child(SidebarLive, { props: () => ({ accountId: 'a1' }) }),
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
  Runtime.scoped(OwnerLive as never, {
    layer: provided as never,
  }) as Effect.Effect<Runtime, never, Scope.Scope>;
const sidebar = (app: Runtime) =>
  app.snapshot.root.children['sidebar'] as Instance;
const collapsed = (app: Runtime) =>
  (sidebar(app).model as { collapsed: ReadonlyArray<string> | null }).collapsed;
const toggle = (app: Runtime, connectionId: string) =>
  app.at(sidebar(app).address)?.send({
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
