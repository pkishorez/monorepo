import { Effect, Queue, Schema } from 'effect';
import type { Layer, Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';
import type { Sessions } from '../../services/sessions/contract/index.js';
import { fakeSessions } from '../../services/sessions/fake/index.js';
import { Kabuki } from '../index.js';

const Name = Schema.NullOr(Schema.String);

const HostShape = Actor.define('Host', {
  input: Schema.Struct({ session: Name }),
  model: Schema.Struct({
    session: Name,
    picked: Schema.Array(Name),
  }),
  message: { Picked: { name: Name }, Moved: { session: Name } },
});

const Host = HostShape.build({
  init: ({ session }) => ({ model: { session, picked: [] } }),
  children: {
    kabuki: Actor.child(Kabuki, {
      input: ({ model }) => ({ session: model.session }),
      props: ({ model }) => ({ session: model.session }),
      emits: { Picked: ({ name }) => ({ _tag: 'Picked', name }) },
    }),
  },
  on: {
    Picked: ({ name }, { model }) => ({
      model: { session: name, picked: [...model.picked, name] },
    }),
    Moved: ({ session }) => ({ model: { session } }),
  },
});

const summary = (name: string, connectedAt = 1): KabukiSessionSummary => ({
  name,
  app: 'Diary',
  environment: 'localhost:5173',
  url: 'http://localhost:5173/',
  origin: 'http://localhost:5173',
  connectedAt,
});

const settle = Effect.promise(
  () => new Promise((done) => setTimeout(done, 20)),
);
const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];
type App = Runtime<typeof Host>;

const tool = (app: App) =>
  walk(app.snapshot.root).find((each) => each.actor === 'Kabuki')!;
const inspected = (app: App) =>
  walk(app.snapshot.root).some((each) => each.actor === 'RemoteInspector');

const start = (
  name: string | null,
  layer: Layer.Layer<Sessions>,
): Effect.Effect<App, never, Scope.Scope> =>
  Runtime.scoped(Host, { input: { session: name }, layer });

describe('the Kabuki Tool', () => {
  it('opens the Kabuki Session its Input names once it is live, and waits while it is gone', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fakeSessions;
        const app = yield* start('quiet-otter', devtools.layer);
        const socket = yield* Queue.take(devtools.sockets);
        expect(tool(app).state).toEqual({
          _tag: 'Absence',
          name: 'quiet-otter',
        });

        yield* Queue.offer(socket, [summary('brave-fox')]);
        yield* settle;
        expect(tool(app).state).toEqual({
          _tag: 'Absence',
          name: 'quiet-otter',
        });
        expect(inspected(app)).toBe(false);

        yield* Queue.offer(socket, [
          summary('brave-fox'),
          summary('quiet-otter'),
        ]);
        yield* settle;
        expect(tool(app).state).toEqual({
          _tag: 'Inspection',
          name: 'quiet-otter',
        });
        expect(inspected(app)).toBe(true);
        expect(devtools.dialed).toEqual(['quiet-otter']);

        yield* Queue.offer(socket, [summary('brave-fox')]);
        yield* settle;
        expect(tool(app).state).toEqual({
          _tag: 'Absence',
          name: 'quiet-otter',
        });
        expect(inspected(app)).toBe(false);
      }),
    ));

  it('reaches a Kabuki Session again when it connects again under the same name', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fakeSessions;
        const app = yield* start('quiet-otter', devtools.layer);
        const socket = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(socket, [summary('quiet-otter', 1)]);
        yield* settle;
        yield* Queue.offer(socket, [summary('quiet-otter', 2)]);
        yield* settle;
        expect(devtools.dialed).toEqual(['quiet-otter', 'quiet-otter']);
        expect(inspected(app)).toBe(true);
      }),
    ));

  it('keeps the list while its socket is closed, and dials again', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fakeSessions;
        const app = yield* start('quiet-otter', devtools.layer);
        const first = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(first, [summary('quiet-otter')]);
        yield* settle;
        yield* Queue.offer(first, null);
        yield* settle;
        expect(tool(app).model).toEqual({
          sessions: [summary('quiet-otter')],
          link: 'reconnecting',
        });
        expect(tool(app).state).toEqual({
          _tag: 'Absence',
          name: 'quiet-otter',
        });

        const second = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(second, [summary('quiet-otter')]);
        yield* settle;
        expect(tool(app).model).toMatchObject({ link: 'live' });
        expect(tool(app).state).toEqual({
          _tag: 'Inspection',
          name: 'quiet-otter',
        });
      }),
    ));

  it('starts on none when its Input names none', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fakeSessions;
        const app = yield* start(null, devtools.layer);
        const socket = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(socket, [summary('quiet-otter')]);
        yield* settle;
        expect(tool(app).state).toEqual({ _tag: 'Choice' });
        expect(inspected(app)).toBe(false);
      }),
    ));

  it('opens the Kabuki Session picked and Emits Picked, once per change', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fakeSessions;
        const app = yield* start(null, devtools.layer);
        const socket = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(socket, [
          summary('brave-fox'),
          summary('quiet-otter'),
        ]);
        yield* settle;

        const kabuki = app.root.children.kabuki;
        kabuki.send({ _tag: 'Chosen', name: 'quiet-otter' });
        yield* settle;
        expect(tool(app).state).toEqual({
          _tag: 'Inspection',
          name: 'quiet-otter',
        });
        expect(inspected(app)).toBe(true);

        kabuki.send({ _tag: 'Chosen', name: 'quiet-otter' });
        kabuki.send({ _tag: 'Chosen', name: 'gone-heron' });
        yield* settle;
        expect(tool(app).state).toEqual({
          _tag: 'Absence',
          name: 'gone-heron',
        });
        expect(app.snapshot.root.model).toMatchObject({
          picked: ['quiet-otter', 'gone-heron'],
        });
      }),
    ));

  it('moves to the Kabuki Session its Props name as the same Tool, its list kept, and says nothing', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fakeSessions;
        const app = yield* start('quiet-otter', devtools.layer);
        const socket = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(socket, [
          summary('brave-fox'),
          summary('quiet-otter'),
        ]);
        yield* settle;
        const before = tool(app).address;

        app.root.send({ _tag: 'Moved', session: 'brave-fox' });
        yield* settle;
        expect(tool(app).address).toBe(before);
        expect(tool(app).state).toEqual({
          _tag: 'Inspection',
          name: 'brave-fox',
        });
        expect(devtools.dialed).toEqual(['quiet-otter', 'brave-fox']);

        app.root.send({ _tag: 'Moved', session: null });
        yield* settle;
        expect(tool(app).address).toBe(before);
        expect(tool(app).state).toEqual({ _tag: 'Choice' });
        expect(yield* Queue.size(devtools.sockets)).toBe(0);
        expect(tool(app).model).toMatchObject({ link: 'live' });
        expect(app.snapshot.root.model).toMatchObject({ picked: [] });
      }),
    ));

  it('changes nothing when its own pick comes back as Props', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fakeSessions;
        const app = yield* start('quiet-otter', devtools.layer);
        const socket = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(socket, [
          summary('brave-fox'),
          summary('quiet-otter'),
        ]);
        yield* settle;
        const before = tool(app).address;

        app.root.children.kabuki.send({ _tag: 'Chosen', name: 'brave-fox' });
        yield* settle;
        expect(app.snapshot.root.model).toEqual({
          session: 'brave-fox',
          picked: ['brave-fox'],
        });
        expect(tool(app).props).toEqual({ session: 'brave-fox' });
        expect(tool(app).address).toBe(before);
        expect(tool(app).state).toEqual({
          _tag: 'Inspection',
          name: 'brave-fox',
        });
        expect(devtools.dialed).toEqual(['quiet-otter', 'brave-fox']);
      }),
    ));

  it('stands on its own as the root, with no Props, and follows its own picks', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fakeSessions;
        const app = yield* Runtime.scoped(Kabuki, {
          input: { session: 'quiet-otter' },
          layer: devtools.layer,
        });
        const socket = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(socket, [
          summary('brave-fox'),
          summary('quiet-otter'),
        ]);
        yield* settle;
        expect(app.snapshot.root.props).toBeUndefined();
        expect(app.snapshot.root.state).toEqual({
          _tag: 'Inspection',
          name: 'quiet-otter',
        });
        app.root.send({ _tag: 'Chosen', name: 'brave-fox' });
        yield* settle;
        expect(app.snapshot.root.state).toEqual({
          _tag: 'Inspection',
          name: 'brave-fox',
        });
      }),
    ));
});
