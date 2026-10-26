import { Clock, Deferred, Effect, Layer, Schema, Scope, Stream } from 'effect';
import {
  CodeClient,
  ProjectNotFound,
  SessionNotFound,
} from '@kestack/connect/code';
import { Actor, type Instance, Runtime, type Running } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { Accounts, AccountsState } from '@kestack/auth-toolkit/client';
import { describe, expect, it } from 'vitest';
import {
  DeviceState,
  nothing,
  type Place,
  type SavedDraft,
  SavedDrafts,
} from '../../../../layer/capabilities/index.ts';
import { savedDraftsMemory } from '../../../../layer/services/index.ts';
import { session } from '../../../routes/index.ts';
import {
  Catalog,
  SessionArrival,
  SharedCatalog,
} from '../capabilities/index.ts';
import { DraftLive } from './actor.ts';

/*
 * The Draft as its pages hold it, the server stood in for: a Session's
 * Draft sends its text and clears at once, and a refused one comes back;
 * a new session's Draft starts the session with the first agent that
 * runs, at its default model, and the app moves to it, or says what is
 * missing. In a Session it has a Side Question mode beside the Message,
 * each the one owner of its text; `/btw` switches to it with the question
 * carried over, typed into the Message or into the skills Picker's
 * search, a question asked replaces the last, and no file or Skill goes
 * in. Its Saved Draft is what it shows, under the Account it opened with,
 * saved a quarter of a second after the last change and at once as it
 * goes; it comes back as it was left, and a new session's is deleted once
 * the session has started. Each round of review's way to lose or bring
 * back a Saved Draft wrongly has its case.
 */

type Api = CodeClient['Service'];

const CATALOG: typeof Catalog.Catalog.Type = {
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
          choices: [
            { value: 'high', label: 'High' },
            { value: 'low', label: 'Low' },
          ],
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

const accountOf = (id: string) => ({
  id,
  email: `${id}@example.com`,
  name: id,
  image: null,
  test: false,
});

const SESSION: Place = { machineId: 'm1', projectId: 'p1', sessionId: 's1' };
const PROJECT: Place = { machineId: 'm1', projectId: 'p1', sessionId: null };

/** What is kept for a place under an Account now. */
const keptIn = (
  saved: Layer.Layer<SavedDrafts>,
  place = SESSION,
  accountId = 'a1',
) =>
  Effect.flatMap(SavedDrafts, (drafts) => drafts.read(accountId, place)).pipe(
    Effect.provide(saved),
  );

/** What the server does with a send: takes it, refuses it, or waits to be told. */
type Answer =
  | 'take'
  | 'refuse'
  | Deferred.Deferred<boolean>
  | ReadonlyArray<Deferred.Deferred<boolean>>;

/** Writes a place's Saved Draft as another tab would. */
const writeIn = (
  saved: Layer.Layer<SavedDrafts>,
  draft: SavedDraft,
  place = SESSION,
) =>
  Effect.flatMap(SavedDrafts, (drafts) =>
    Effect.flatMap(Clock.monotonicTimeNanos, (at) =>
      drafts.save('a1', place, draft, at, at),
    ),
  ).pipe(Effect.provide(saved));

const world = (
  answer: Answer = 'take',
  saved = savedDraftsMemory(),
  /** What the server does with a start: takes it, or waits to be told. */
  starts: 'take' | Deferred.Deferred<boolean> = 'take',
  /** How a start told no fails: the Machine refusing it, or otherwise. */
  failure: () => Effect.Effect<never, unknown> = () =>
    Effect.fail(new ProjectNotFound({ id: 'p1' })),
  /** Whether a session asked for, its answer lost, shows among the Machine's. */
  arrives = true,
) => {
  const sent: Array<unknown> = [];
  const asked: Array<unknown> = [];
  const started: Array<unknown> = [];
  const pushed: Array<unknown> = [];
  /** Who is signed in: switched by a test. */
  const signed = { id: 'a1' };
  const layer = Layer.mergeAll(
    // An RPC client's procedures are generic over how they are called; a
    // stand-in answers the one way the Draft calls them.
    Layer.mock(CodeClient)({
      send: ((args: unknown) =>
        Effect.suspend(() => {
          sent.push(args);
          const taken =
            answer === 'take'
              ? Effect.succeed(true)
              : answer === 'refuse'
                ? Effect.succeed(false)
                : Array.isArray(answer)
                  ? Deferred.await(answer[sent.length - 1]!)
                  : Deferred.await(answer as Deferred.Deferred<boolean>);
          return Effect.flatMap(taken, (ok) =>
            ok ? Effect.void : Effect.fail(new SessionNotFound({ id: 's1' })),
          );
        })) as unknown as Api['send'],
      ask: ((args: unknown) =>
        Effect.sync(() => {
          asked.push(args);
          return { _tag: 'Text' as const, text: 'It is fine' };
        })) as unknown as Api['ask'],
      startSession: ((args: unknown) =>
        Effect.suspend(() => {
          started.push(args);
          const taken =
            starts === 'take' ? Effect.succeed(true) : Deferred.await(starts);
          return Effect.flatMap(taken, (ok) =>
            ok ? Effect.succeed({ id: 's9' }) : failure(),
          );
        })) as unknown as Api['startSession'],
    }),
    Layer.succeed(SharedCatalog, {
      changes: Stream.concat(Stream.make(CATALOG), Stream.never),
      retry: Effect.void,
    }),
    Layer.succeed(SessionArrival, { arrived: () => Effect.succeed(arrives) }),
    Layer.mock(Navigation)({
      push: (to) => Effect.sync(() => void pushed.push(to)),
    }),
    saved,
    Layer.mock(Accounts)({
      current: Effect.sync(() => {
        const active = accountOf(signed.id);
        return AccountsState.SignedIn({ active, accounts: [active] });
      }),
    }),
    // Its Touch Drafts read how they are written.
    Layer.mock(DeviceState)({
      read: Effect.succeed(nothing),
      changes: Stream.never,
    }),
  );
  return { layer, sent, asked, started, pushed, saved, signed };
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

type Mode = 'Message' | 'SideQuestion';

type Written = {
  readonly text: string;
  readonly anchor: number;
  readonly head: number;
};

const modelOf = (app: Running<unknown>) =>
  draftOf(app).model as {
    readonly mode: Mode;
    readonly picking: unknown;
    readonly problem: string | null;
    readonly starting: boolean;
    readonly attachments: ReadonlyArray<unknown>;
    readonly chosen: unknown;
    readonly insert: { readonly what: unknown } | null;
    readonly asked: {
      readonly question: string;
      readonly answer: string | null;
    } | null;
  };

/** Each Draft Mode Child, by mode, as it holds its text. */
const modesOf = (app: Running<unknown>) =>
  Object.fromEntries(
    walk(draftOf(app))
      .filter((each) => each.actor === 'DraftMode')
      .map((each) => [(each.props as { readonly mode: string }).mode, each]),
  );

const writtenOf = (app: Running<unknown>, mode: Mode) =>
  (modesOf(app)[mode]!.model as { readonly written: Written }).written;

const textOf = (app: Running<unknown>, mode: Mode = modelOf(app).mode) =>
  writtenOf(app, mode).text;

/** An edit in a mode, as the editor its View draws hands it. */
const write = (app: Running<unknown>, text: string, mode = modelOf(app).mode) =>
  Effect.sync(() =>
    app.send(modesOf(app)[mode]!.id, {
      _tag: 'Edited',
      text,
      anchor: text.length,
      head: text.length,
    }),
  );

const ask = (app: Running<unknown>, mode: Mode) =>
  Effect.sync(() => app.send(draftOf(app).id, { _tag: 'ModeAsked', mode }));

const toDraft = (app: Running<unknown>, message: unknown) =>
  Effect.sync(() => app.send(draftOf(app).id, message as never));

const start = (
  to: typeof To.Type,
  layer: Layer.Layer<never> | Layer.Layer<any>,
) =>
  Runtime.start(Owner(to) as never, layer as never) as Effect.Effect<
    Running<unknown>,
    never,
    Scope.Scope
  >;

/** Writes in the mode open and sends it, as Enter does. */
const say = (app: Running<unknown>, text: string) =>
  Effect.andThen(
    Effect.andThen(
      write(app, text),
      Effect.sync(() =>
        app.send(modesOf(app)[modelOf(app).mode]!.id, { _tag: 'SendAsked' }),
      ),
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
        expect(textOf(app, 'Message')).toBe('');
      }),
    ));

  it('brings a refused send back to its mode, and says why', () =>
    run(
      Effect.gen(function* () {
        const { layer } = world('refuse');
        const app = yield* start('Session', layer);
        yield* wait();
        yield* say(app, 'Carry on');
        expect(textOf(app, 'Message')).toBe('Carry on');
        expect(modelOf(app).problem).toBe('This session no longer exists');
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
        expect(writtenOf(app, 'Message')).toEqual({
          text: 'Half a message',
          anchor: 14,
          head: 14,
        });
        expect(textOf(app, 'SideQuestion')).toBe('which file?');
        expect(draftOf(app).model).not.toHaveProperty('written');
      }),
    ));

  it('switches to a Side Question on `/btw`, the rest carried over', () =>
    run(
      Effect.gen(function* () {
        const { layer, sent } = world();
        const app = yield* start('Session', layer);
        yield* wait();
        yield* write(app, '/btw is it done?');
        yield* wait();
        expect(modelOf(app).mode).toBe('SideQuestion');
        expect(textOf(app, 'SideQuestion')).toBe('is it done?');
        expect(textOf(app, 'Message')).toBe('');
        expect(sent).toEqual([]);
      }),
    ));

  it('switches to a Side Question as `btw ` is typed in the skills Picker a `/` opened', () =>
    run(
      Effect.gen(function* () {
        const { layer } = world();
        const app = yield* start('Session', layer);
        yield* wait();
        yield* write(app, '/');
        yield* toDraft(app, {
          _tag: 'PickerOpened',
          picking: { _tag: 'Skills', how: 'keys', typed: true },
        });
        const picker = walk(draftOf(app)).find(
          (each) => each.actor === 'SkillPicker',
        )!;
        yield* Effect.sync(() =>
          app.send(picker.id, { _tag: 'Typed', query: 'btw what is this?' }),
        );
        yield* wait();
        expect(modelOf(app).picking).toBeNull();
        expect(modelOf(app).insert?.what).toEqual({
          _tag: 'Skill',
          name: 'btw what is this?',
          typed: true,
        });
        // The editor puts the Skill in over the `/` typed.
        yield* write(app, '/btw what is this? ');
        yield* wait();
        expect(modelOf(app).mode).toBe('SideQuestion');
        expect(textOf(app, 'SideQuestion')).toBe('what is this?');
        expect(textOf(app, 'Message')).toBe('');
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
        yield* toDraft(app, {
          _tag: 'PickerOpened',
          picking: { _tag: 'Skills', how: 'keys', typed: false },
        });
        expect(modelOf(app).picking).toBeNull();
        yield* toDraft(app, {
          _tag: 'PickerOpened',
          picking: { _tag: 'Model', how: 'keys', at: 'model' },
        });
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
        yield* wait();
        expect(modelOf(app).mode).toBe('Message');
        expect(textOf(app, 'Message')).toBe('/btw hello');
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
            id: expect.any(String),
            projectId: 'p1',
            account: 'claude',
            model: 'opus',
            settings: { effort: 'high' },
            text: 'Fix the build',
            attachments: [],
          },
        ]);
        expect(pushed).toEqual([session('m1', 'p1', 's9')]);
      }),
    ));

  it('stays and says why when the Machine refuses a start, as nothing was started', () =>
    run(
      Effect.gen(function* () {
        const starts = yield* Deferred.make<boolean>();
        const { layer, pushed } = world('take', savedDraftsMemory(), starts);
        const app = yield* start('NewSession', layer);
        yield* wait();
        yield* say(app, 'Fix the build');
        yield* Deferred.succeed(starts, false);
        yield* wait();
        expect(pushed).toEqual([]);
        expect(modelOf(app).starting).toBe(false);
        expect(modelOf(app).problem).not.toBeNull();
      }),
    ));

  it('moves to the session it asked for once it shows, its answer lost or unreadable', async () => {
    const failures = [
      () => Effect.fail(new Error('the line went down')),
      () => Effect.die(new Error('the answer could not be read')),
    ];
    for (const failure of failures)
      await run(
        Effect.gen(function* () {
          const starts = yield* Deferred.make<boolean>();
          const { layer, started, pushed } = world(
            'take',
            savedDraftsMemory(),
            starts,
            failure,
          );
          const app = yield* start('NewSession', layer);
          yield* wait();
          yield* say(app, 'Fix the build');
          yield* Deferred.succeed(starts, false);
          yield* wait();
          const { id } = started[0] as { readonly id: string };
          expect(pushed).toEqual([session('m1', 'p1', id)]);
        }),
      );
  });

  it('stays, says why and keeps what was written when the session it asked for never shows', () =>
    run(
      Effect.gen(function* () {
        const starts = yield* Deferred.make<boolean>();
        const { layer, pushed } = world(
          'take',
          savedDraftsMemory(),
          starts,
          () => Effect.fail(new Error('the line went down')),
          false,
        );
        const app = yield* start('NewSession', layer);
        yield* wait();
        yield* say(app, 'Fix the build');
        yield* Deferred.succeed(starts, false);
        yield* wait();
        expect(pushed).toEqual([]);
        expect(modelOf(app).starting).toBe(false);
        expect(modelOf(app).problem).not.toBeNull();
        expect(textOf(app, 'Message')).toBe('Fix the build');
      }),
    ));

  it('asks for the first message before it starts anything, keeping what was written', () =>
    run(
      Effect.gen(function* () {
        const { layer, started } = world();
        const app = yield* start('NewSession', layer);
        yield* wait();
        yield* say(app, '   ');
        expect(started).toEqual([]);
        expect(modelOf(app).problem).toBe('Write the first message');
        expect(textOf(app, 'Message')).toBe('   ');
      }),
    ));

  describe('Saved Drafts', () => {
    const effort = (app: Running<unknown>, value: string) =>
      toDraft(app, { _tag: 'SettingChosen', key: 'effort', value });

    it('saves it a quarter of a second after the last change, not before', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved } = world();
          const app = yield* start('Session', layer);
          yield* wait();
          yield* write(app, 'Half');
          yield* wait(100);
          yield* write(app, 'Half a thought');
          yield* wait(150);
          expect(yield* keptIn(saved)).toBeNull();
          yield* wait(200);
          expect(yield* keptIn(saved)).toEqual({
            mode: 'Message',
            written: {
              Message: { text: 'Half a thought', anchor: 14, head: 14 },
              SideQuestion: { text: '', anchor: 0, head: 0 },
            },
            attachments: [],
            chosen: { account: null, model: null, settings: {} },
          });
        }),
      ));

    it('saves it at once as the Draft goes', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved } = world();
          yield* Effect.scoped(
            Effect.gen(function* () {
              const app = yield* start('Session', layer);
              yield* wait();
              yield* write(app, 'Leaving now');
            }),
          );
          expect((yield* keptIn(saved))?.written['Message']?.text).toBe(
            'Leaving now',
          );
        }),
      ));

    it('saves it under the Account it opened with, even as another is switched to before it goes', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved, signed } = world();
          yield* Effect.scoped(
            Effect.gen(function* () {
              const app = yield* start('Session', layer);
              yield* wait();
              yield* write(app, 'Mine, not theirs');
              signed.id = 'a2';
            }),
          );
          expect(
            (yield* keptIn(saved, SESSION, 'a1'))?.written['Message']?.text,
          ).toBe('Mine, not theirs');
          expect(yield* keptIn(saved, SESSION, 'a2')).toBeNull();
        }),
      ));

    it('brings back the mode, each text and cursor, the files and what was picked', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved } = world();
          const draft: SavedDraft = {
            mode: 'SideQuestion',
            written: {
              Message: { text: 'Fix the build', anchor: 4, head: 9 },
              SideQuestion: { text: 'why red?', anchor: 3, head: 3 },
            },
            attachments: [
              { name: 'a.txt', mime: 'text/plain', data: 'aGk=', size: 2 },
            ],
            chosen: {
              account: null,
              model: 'haiku',
              settings: { effort: 'low' },
            },
          };
          yield* writeIn(saved, draft);
          const app = yield* start('Session', layer);
          yield* wait();
          expect(modelOf(app).mode).toBe('SideQuestion');
          expect(modelOf(app).attachments).toEqual(draft.attachments);
          expect(modelOf(app).chosen).toEqual(draft.chosen);
          expect(writtenOf(app, 'Message')).toEqual({
            text: 'Fix the build',
            anchor: 4,
            head: 9,
          });
          expect(textOf(app, 'SideQuestion')).toBe('why red?');
        }),
      ));

    it('deletes it once the Draft shows nothing again', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved } = world();
          const app = yield* start('Session', layer);
          yield* wait();
          yield* write(app, 'Never mind');
          yield* wait(300);
          expect(yield* keptIn(saved)).not.toBeNull();
          yield* write(app, '');
          yield* wait(300);
          expect(yield* keptIn(saved)).toBeNull();
        }),
      ));

    it('deletes a restored one emptied before its first save', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved } = world();
          yield* writeIn(saved, {
            mode: 'Message',
            written: {
              Message: { text: 'Restored', anchor: 8, head: 8 },
              SideQuestion: { text: '', anchor: 0, head: 0 },
            },
            attachments: [],
            chosen: { account: null, model: null, settings: {} },
          });
          const app = yield* start('Session', layer);
          yield* wait();
          yield* write(app, '');
          yield* wait(300);
          expect(yield* keptIn(saved)).toBeNull();
        }),
      ));

    it('saves what a send leaves, the Message emptied, the Side Question and the picks as shown', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved } = world();
          const app = yield* start('Session', layer);
          yield* wait();
          yield* effort(app, 'low');
          yield* ask(app, 'SideQuestion');
          yield* write(app, 'a question too');
          yield* ask(app, 'Message');
          yield* say(app, 'Carry on');
          yield* wait(300);
          expect(yield* keptIn(saved)).toEqual({
            mode: 'Message',
            written: {
              Message: { text: '', anchor: 0, head: 0 },
              SideQuestion: { text: 'a question too', anchor: 14, head: 14 },
            },
            attachments: [],
            chosen: { account: null, model: null, settings: { effort: 'low' } },
          });
        }),
      ));

    // Codex round 2, 1: a start pending kept nothing, and a failed one lost the text.
    it('keeps saving while a new session starts, so a start that fails loses nothing', () =>
      run(
        Effect.gen(function* () {
          const starts = yield* Deferred.make<boolean>();
          const { layer, saved } = world('take', savedDraftsMemory(), starts);
          yield* Effect.scoped(
            Effect.gen(function* () {
              const app = yield* start('NewSession', layer);
              yield* wait();
              yield* effort(app, 'low');
              yield* say(app, 'Fix the build');
              expect(modelOf(app).starting).toBe(true);
            }),
          );
          const kept = yield* keptIn(saved, PROJECT);
          expect(kept?.written['Message']?.text).toBe('Fix the build');
          expect(kept?.chosen.settings).toEqual({ effort: 'low' });
          yield* Deferred.succeed(starts, false);
          const app = yield* start('NewSession', layer);
          yield* wait();
          expect(textOf(app, 'Message')).toBe('Fix the build');
        }),
      ));

    // Codex round 2, 2: a later send taken took the earlier ones' copies with it.
    it('brings a refused send back into the Draft and saves it, whatever a later send does', () =>
      run(
        Effect.gen(function* () {
          const first = yield* Deferred.make<boolean>();
          const second = yield* Deferred.make<boolean>();
          const { layer, saved } = world([first, second]);
          const app = yield* start('Session', layer);
          yield* wait();
          yield* say(app, 'First');
          yield* say(app, 'Second');
          yield* Deferred.succeed(first, false);
          yield* wait();
          expect(textOf(app, 'Message')).toBe('First');
          yield* Deferred.succeed(second, true);
          yield* wait(300);
          expect((yield* keptIn(saved))?.written['Message']?.text).toBe(
            'First',
          );
        }),
      ));

    // Codex round 2, 3: tabs merged by part, and a retry wrote a stale copy.
    it('lets the last save win across tabs, the whole Draft as this one shows it', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved } = world();
          const app = yield* start('Session', layer);
          yield* wait();
          yield* write(app, 'From this tab');
          yield* wait(300);
          yield* writeIn(saved, {
            mode: 'SideQuestion',
            written: {
              SideQuestion: { text: 'From the other tab', anchor: 0, head: 0 },
            },
            attachments: [],
            chosen: { account: null, model: 'haiku', settings: {} },
          });
          yield* write(app, 'From this tab, later');
          yield* wait(300);
          expect(yield* keptIn(saved)).toEqual({
            mode: 'Message',
            written: {
              Message: { text: 'From this tab, later', anchor: 20, head: 20 },
              SideQuestion: { text: '', anchor: 0, head: 0 },
            },
            attachments: [],
            chosen: { account: null, model: null, settings: {} },
          });
        }),
      ));

    // Codex round 2, 4: a send within the quarter second marked a pick saved.
    it('saves a pick made just before a send', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved } = world();
          yield* Effect.scoped(
            Effect.gen(function* () {
              const app = yield* start('Session', layer);
              yield* wait();
              yield* effort(app, 'low');
              yield* say(app, 'Carry on');
            }),
          );
          expect((yield* keptIn(saved))?.chosen.settings).toEqual({
            effort: 'low',
          });
        }),
      ));

    // Codex round 2, 5: another mode's late save brought back what a send cleared.
    it('never brings a sent Message back into its Saved Draft', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved } = world();
          const app = yield* start('Session', layer);
          yield* wait();
          yield* write(app, 'Carry on');
          yield* ask(app, 'SideQuestion');
          yield* write(app, 'and this?');
          yield* ask(app, 'Message');
          yield* Effect.sync(() =>
            app.send(modesOf(app)['Message']!.id, { _tag: 'SendAsked' }),
          );
          yield* wait(600);
          const kept = yield* keptIn(saved);
          expect(kept?.written['Message']?.text).toBe('');
          expect(kept?.written['SideQuestion']?.text).toBe('and this?');
        }),
      ));

    it('loses a send refused once the Draft has gone, as documented', () =>
      run(
        Effect.gen(function* () {
          const answer = yield* Deferred.make<boolean>();
          const { layer, saved } = world(answer);
          yield* Effect.scoped(
            Effect.gen(function* () {
              const app = yield* start('Session', layer);
              yield* wait();
              yield* say(app, 'Carry on');
            }),
          );
          yield* Deferred.succeed(answer, false);
          yield* wait();
          expect(yield* keptIn(saved)).toBeNull();
        }),
      ));

    it('deletes the new session’s Saved Draft, picks and all, once the session starts, and saves no more', () =>
      run(
        Effect.gen(function* () {
          const { layer, saved, started } = world();
          yield* Effect.scoped(
            Effect.gen(function* () {
              const app = yield* start('NewSession', layer);
              yield* wait();
              yield* effort(app, 'low');
              yield* write(app, 'Fix the build');
              yield* wait(300);
              expect(yield* keptIn(saved, PROJECT)).not.toBeNull();
              yield* say(app, 'Fix the build');
              expect(started).toHaveLength(1);
              yield* wait(300);
              expect(yield* keptIn(saved, PROJECT)).toBeNull();
              yield* effort(app, 'high');
              yield* wait(300);
              expect(yield* keptIn(saved, PROJECT)).toBeNull();
            }),
          );
          expect(yield* keptIn(saved, PROJECT)).toBeNull();
        }),
      ));
  });
});
