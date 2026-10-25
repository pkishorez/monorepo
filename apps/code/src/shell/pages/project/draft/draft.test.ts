import { Effect, Layer, Schema, Scope, Stream } from 'effect';
import { CodeClient, SessionNotFound } from '@kestack/connect/code';
import { Actor, type Instance, Runtime, type Running } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { describe, expect, it } from 'vitest';
import { DeviceState, nothing } from '../../../../layer/capabilities/index.ts';
import { session } from '../../../routes/index.ts';
import { Catalog, SharedCatalog } from '../capabilities/index.ts';
import { DraftLive } from './actor.ts';

/*
 * The Draft as its pages hold it, the server stood in for: a Session's
 * Draft sends its text and clears at once, and a refused one comes back;
 * a new session's Draft starts the session with the first agent that
 * runs, at its default model, and the app moves to it, or says what is
 * missing. In a Session it has a Side Question mode beside the Message,
 * each with its own text; `/btw` switches to it with the question carried
 * over, a question asked replaces the last, and no file or Skill goes in.
 */

type Api = CodeClient['Service'];

const CATALOG: typeof Catalog.Model.Type = {
  ...Catalog.empty,
  harnesses: [
    {
      account: 'codex',
      harness: 'codex',
      name: 'Codex',
      settings: [],
      defaultModel: 'gpt',
      available: false,
      unavailableReason: 'not installed',
    },
    {
      account: 'claude',
      harness: 'claude',
      name: 'Claude',
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
                    account: 'claude',
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
    // Its Touch Draft reads how it is written.
    Layer.mock(DeviceState)({
      read: Effect.succeed(nothing),
      changes: Stream.never,
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

type Written = {
  readonly text: string;
  readonly anchor: number;
  readonly head: number;
};

const modelOf = (app: Running<unknown>) => {
  const model = draftOf(app).model as {
    readonly mode: 'Message' | 'SideQuestion';
    readonly written: Readonly<Record<'Message' | 'SideQuestion', Written>>;
    readonly picking: unknown;
    readonly problem: string | null;
    readonly starting: boolean;
    readonly asked: {
      readonly question: string;
      readonly answer: string | null;
    } | null;
  };
  return { ...model, text: model.written.Message.text };
};

/** Each Draft Mode Child, by mode, as it holds its text. */
const modesOf = (app: Running<unknown>) =>
  Object.fromEntries(
    walk(draftOf(app))
      .filter((each) => each.actor === 'DraftMode')
      .map((each) => [(each.props as { readonly mode: string }).mode, each]),
  );

/** An edit in the mode open, as its View hands it to the mode and the Draft. */
const write = (app: Running<unknown>, text: string, mode = modelOf(app).mode) =>
  Effect.sync(() => {
    const written = { text, anchor: text.length, head: text.length };
    app.send(modesOf(app)[mode]!.id, { _tag: 'Edited', ...written });
    app.send(draftOf(app).id, { _tag: 'Written', mode, ...written });
  });

/** What each mode's View does once the Draft sets its text: takes it. */
const take = (app: Running<unknown>) =>
  Effect.sync(() => {
    for (const mode of Object.values(modesOf(app)))
      app.send(mode.id, { _tag: 'ResetTaken' });
  });

const textOf = (app: Running<unknown>, mode: string) =>
  (modesOf(app)[mode]!.model as { readonly written: Written }).written.text;

const ask = (app: Running<unknown>, mode: 'Message' | 'SideQuestion') =>
  Effect.sync(() => app.send(draftOf(app).id, { _tag: 'ModeAsked', mode }));

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
    Effect.andThen(
      write(app, text),
      Effect.sync(() => app.send(draftOf(app).id, { _tag: 'SendAsked' })),
    ),
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
        yield* take(app);
        expect(textOf(app, 'Message')).toBe('');
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
        yield* take(app);
        expect(textOf(app, 'Message')).toBe('Carry on');
      }),
    ));

  it('keeps each mode its own text as it switches between them', () =>
    run(
      Effect.gen(function* () {
        const { layer } = world();
        const app = yield* start('Session', layer);
        yield* wait();
        yield* write(app, 'Half a message');
        yield* ask(app, 'SideQuestion');
        expect(modelOf(app).mode).toBe('SideQuestion');
        yield* write(app, 'which file?');
        yield* ask(app, 'Message');
        expect(modelOf(app).mode).toBe('Message');
        expect(modelOf(app).written).toEqual({
          Message: { text: 'Half a message', anchor: 14, head: 14 },
          SideQuestion: { text: 'which file?', anchor: 11, head: 11 },
        });
        expect(textOf(app, 'Message')).toBe('Half a message');
        expect(textOf(app, 'SideQuestion')).toBe('which file?');
      }),
    ));

  it('switches to a Side Question on `/btw`, the rest carried over', () =>
    run(
      Effect.gen(function* () {
        const { layer, sent } = world();
        const app = yield* start('Session', layer);
        yield* wait();
        yield* write(app, '/btw is it done?');
        yield* take(app);
        expect(modelOf(app).mode).toBe('SideQuestion');
        expect(modelOf(app).written.SideQuestion.text).toBe('is it done?');
        expect(textOf(app, 'SideQuestion')).toBe('is it done?');
        expect(textOf(app, 'Message')).toBe('');
        expect(sent).toEqual([]);
      }),
    ));

  it('asks a Side Question of the session, sending nothing, and a new one replaces it', () =>
    run(
      Effect.gen(function* () {
        const { layer, sent, asked } = world();
        const app = yield* start('Session', layer);
        yield* wait();
        yield* ask(app, 'SideQuestion');
        yield* say(app, 'is it done?');
        expect(sent).toEqual([]);
        expect(asked).toEqual([
          { sessionId: 's1', question: 'is it done?', schema: null },
        ]);
        expect(modelOf(app).asked).toMatchObject({
          question: 'is it done?',
          answer: 'It is fine',
        });
        yield* take(app);
        expect(textOf(app, 'SideQuestion')).toBe('');
        yield* say(app, 'and the tests?');
        expect(modelOf(app).asked).toMatchObject({
          question: 'and the tests?',
          answer: 'It is fine',
        });
        expect(modelOf(app).mode).toBe('SideQuestion');
      }),
    ));

  it('takes no file and no Skill in a Side Question', () =>
    run(
      Effect.gen(function* () {
        const { layer } = world();
        const app = yield* start('Session', layer);
        yield* wait();
        yield* ask(app, 'SideQuestion');
        yield* Effect.sync(() =>
          app.send(draftOf(app).id, {
            _tag: 'PickerOpened',
            picking: { _tag: 'Skills', how: 'keys', typed: false },
          }),
        );
        expect(modelOf(app).picking).toBeNull();
        yield* Effect.sync(() =>
          app.send(draftOf(app).id, {
            _tag: 'PickerOpened',
            picking: { _tag: 'Model', how: 'keys', at: 'model' },
          }),
        );
        expect(modelOf(app).picking).toBeNull();
      }),
    ));

  it('has no Side Question before there is a session', () =>
    run(
      Effect.gen(function* () {
        const { layer } = world();
        const app = yield* start('NewSession', layer);
        yield* wait();
        expect(Object.keys(modesOf(app))).toEqual(['Message']);
        yield* ask(app, 'SideQuestion');
        expect(modelOf(app).mode).toBe('Message');
        yield* write(app, '/btw hello');
        expect(modelOf(app).mode).toBe('Message');
        expect(modelOf(app).text).toBe('/btw hello');
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
            account: 'claude',
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
