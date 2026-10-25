import { Effect, Layer, Schema, Scope, Stream } from 'effect';
import { CodeClient, SessionNotFound } from '@kestack/connect/code';
import { Actor, type Instance, Runtime, type Running } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { describe, expect, it } from 'vitest';
import { session } from '../../../routes/index.ts';
import { SharedCatalog } from '../capabilities/index.ts';
import * as Catalog from '../catalog/index.ts';
import { DraftLive } from './actor.ts';

/*
 * The Draft as its pages hold it, the server stood in for: a Session's
 * Draft sends its text and clears at once, and a refused one comes back;
 * `/btw` asks on the side instead; a new session's Draft starts the session
 * with the first agent that runs, at its default model, and the app moves
 * to it, or says what is missing.
 */

type Api = CodeClient['Service'];

const CATALOG: typeof Catalog.Model.Type = {
  ...Catalog.empty,
  harnesses: [
    {
      name: 'codex',
      label: 'Codex',
      settings: [],
      defaultModel: 'gpt',
      available: false,
      unavailableReason: 'not installed',
    },
    {
      name: 'claude',
      label: 'Claude',
      settings: [
        {
          key: 'effort',
          label: 'Effort',
          choices: [{ value: 'high', label: 'High' }],
          default: 'high',
        },
      ],
      defaultModel: 'opus',
      available: true,
      unavailableReason: null,
    },
  ],
};

const To = Schema.Literals(['NewSession', 'Session']);

/** A page holding a Draft: a new session's, or a Session's that runs Claude. */
const Owner = (to: typeof To.Type) =>
  Actor.build(Actor.define('Owner', {}), {
    children: {
      draft: {
        actor: DraftLive,
        props: () => ({
          machineId: 'm1',
          projectId: 'p1',
          to:
            to === 'NewSession'
              ? { _tag: 'NewSession' as const }
              : {
                  _tag: 'Session' as const,
                  sessionId: 's1',
                  agent: {
                    harness: 'claude' as const,
                    model: 'opus',
                    settings: {},
                  },
                  running: false,
                },
        }),
      },
    },
  });

/** The stand-ins, and what they were asked. */
const world = (refuse = false) => {
  const sent: Array<unknown> = [];
  const asked: Array<unknown> = [];
  const started: Array<unknown> = [];
  const pushed: Array<unknown> = [];
  const layer = Layer.mergeAll(
    // An RPC client's procedures are generic over how they are called; a
    // stand-in answers the one way the Draft calls them.
    Layer.mock(CodeClient)({
      send: ((args: unknown) =>
        Effect.suspend(() => {
          sent.push(args);
          return refuse
            ? Effect.fail(new SessionNotFound({ id: 's1' }))
            : Effect.void;
        })) as unknown as Api['send'],
      ask: ((args: unknown) =>
        Effect.sync(() => {
          asked.push(args);
          return { _tag: 'Text' as const, text: 'It is fine' };
        })) as unknown as Api['ask'],
      startSession: ((args: unknown) =>
        Effect.sync(() => {
          started.push(args);
          return { id: 's9' };
        })) as unknown as Api['startSession'],
    }),
    Layer.succeed(SharedCatalog, {
      changes: Stream.concat(Stream.make(CATALOG), Stream.never),
      retry: Effect.void,
    }),
    Layer.mock(Navigation)({
      push: (to) => Effect.sync(() => void pushed.push(to)),
    }),
  );
  return { layer, sent, asked, started, pushed };
};

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect) as Effect.Effect<A>);

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];

const draftOf = (app: Running<unknown>) =>
  walk(app.snapshot()).find((each) => each.actor === 'Draft')!;

const modelOf = (app: Running<unknown>) =>
  draftOf(app).model as {
    readonly text: string;
    readonly problem: string | null;
    readonly starting: boolean;
    readonly asked: { readonly answer: string | null } | null;
  };

const start = (
  to: typeof To.Type,
  layer: Layer.Layer<never> | Layer.Layer<any>,
) =>
  Runtime.start(Owner(to) as never, layer as never) as Effect.Effect<
    Running<unknown>,
    never,
    Scope.Scope
  >;

const say = (app: Running<unknown>, text: string) =>
  Effect.andThen(
    Effect.sync(() => {
      app.send(draftOf(app).id, { _tag: 'Typed', text });
      app.send(draftOf(app).id, { _tag: 'SendAsked' });
    }),
    wait(),
  );

describe('Draft', () => {
  it('sends a Session its text with the files, and clears at once', () =>
    run(
      Effect.gen(function* () {
        const { layer, sent } = world();
        const app = yield* start('Session', layer);
        yield* wait();
        yield* say(app, '  Carry on  ');
        expect(sent).toEqual([
          { sessionId: 's1', text: 'Carry on', attachments: [] },
        ]);
        expect(modelOf(app).text).toBe('');
      }),
    ));

  it('brings a refused send back, and says why', () =>
    run(
      Effect.gen(function* () {
        const { layer } = world(true);
        const app = yield* start('Session', layer);
        yield* wait();
        yield* say(app, 'Carry on');
        expect(modelOf(app).text).toBe('Carry on');
        expect(modelOf(app).problem).toBe('This session no longer exists');
      }),
    ));

  it('asks on the side with `/btw`, sending nothing', () =>
    run(
      Effect.gen(function* () {
        const { layer, sent, asked } = world();
        const app = yield* start('Session', layer);
        yield* wait();
        yield* say(app, '/btw is it done?');
        expect(sent).toEqual([]);
        expect(asked).toEqual([
          { sessionId: 's1', question: 'is it done?', schema: null },
        ]);
        expect(modelOf(app).asked?.answer).toBe('It is fine');
      }),
    ));

  it('starts a new session with the first agent that runs, then moves to it', () =>
    run(
      Effect.gen(function* () {
        const { layer, started, pushed } = world();
        const app = yield* start('NewSession', layer);
        yield* wait();
        yield* say(app, 'Fix the build');
        expect(started).toEqual([
          {
            projectId: 'p1',
            harness: 'claude',
            model: 'opus',
            settings: { effort: 'high' },
            text: 'Fix the build',
            attachments: [],
          },
        ]);
        expect(pushed).toEqual([session('m1', 'p1', 's9')]);
        expect(modelOf(app).text).toBe('');
      }),
    ));

  it('asks for the first message before it starts anything', () =>
    run(
      Effect.gen(function* () {
        const { layer, started } = world();
        const app = yield* start('NewSession', layer);
        yield* wait();
        yield* say(app, '   ');
        expect(started).toEqual([]);
        expect(modelOf(app).problem).toBe('Write the first message');
      }),
    ));
});
