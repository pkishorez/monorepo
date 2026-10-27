import { Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import {
  CodeClients,
  CodeReplicaLive,
  HarnessAccountInfo,
  HarnessInfo,
  SessionQuestions,
  SpeechToTextState,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Cache, Copy, copying, Marks, Seen, Sync } from './store/index.ts';
import {
  Answering,
  Link,
  ModelsRead,
  readOver,
  type Setup,
  SetupChange,
  SetupParts,
} from '../machines.ts';
import { ask, speechOn } from './commands.ts';
import { answeringAsked, questionsOn } from './records/index.ts';
import { keepSetup, SetupShelf } from './commands.ts';

/*
 * A Machine: one listed Machine of the Account, and what the app keeps of
 * it in its own database, `code:account:<accountId>:machine:<machineId>`:
 * its setup, its Harness Accounts, its Speech to Text, and its agents with
 * each one's models; its Unseen marks; and its records, in its own sync
 * Store.
 *
 * 1. Kept    `Reading` reads the setup this device kept; `Shown` shows it
 *            at once, kept or not.
 * 2. Ask     then the Machine is asked again behind, once its Line is
 *            connected, and again each time its Line connects, on
 *            Reload, and when Settings asks; its answer replaces what
 *            shows, a model list it refused keeping what showed, and is
 *            kept.
 * 3. Change  a change Settings made to the Machine shows at once, is kept,
 *            and the Machine is asked again, so an answer begun before it
 *            never undoes it.
 * 4. Speech  how Speech to Text stands, watched live once the kept copy
 *            shows, so it is shown over it, never in its place: each
 *            change shows and is kept, a download's progress only as it
 *            starts.
 * 5. Seen    its Unseen marks, read, and read again after every write,
 *            from this tab or another.
 * 6. Sync    its own Store, and the Replicas over it, Provided to the one
 *            Child that runs its Instance, and said through `Machines`, so
 *            a page, which is no Child of it, reads this Machine's records
 *            and no other's.
 * 7. Share   its setup and marks in `Machines`, for Settings, the Dictation,
 *            the sidebar and each Project; taken out as the Machine goes.
 * 8. Asked   the Agent Questions its Sessions' Turns wait on, whole on each
 *            change (`records/questions/`), shared in `Machines` too, for
 *            the sidebar's marks and the open session's Question Panel.
 *            Never kept: they live only while their Turn runs.
 * 9. Answering how each is being answered here, as the Question Panel
 *            gives it: each Item's answer so far, minimised or not, tried
 *            or sent, so leaving the session or the page loses nothing.
 *            Kept here, in memory, while the question is asked, and
 *            shared in `Machines`; a question gone from the feed takes
 *            its part with it. Never written to storage: an answer may be
 *            a secret.
 */

const Line = Schema.Literals(['connecting', 'connected', 'reconnecting']);

const Model = Schema.Struct({
  accountId: Schema.String,
  machineId: Schema.String,
  setup: Copy(SetupParts),
  line: Line,
  /** Its Unseen marks; null until read. */
  seen: Schema.NullOr(Marks),
  /** Its Sessions' Agent Questions, as it last said them. */
  questions: Schema.Array(SessionQuestions),
  /** How each Session's questions are being answered here, by Session id. */
  answering: Schema.Record(Schema.String, Answering),
});
type Model = typeof Model.Type;

const Machine = Actor.define('Machine', {
  requires: [CodeClients, Cache, Seen, Sync, Link],
  input: Schema.Struct({ accountId: Schema.String, machineId: Schema.String }),
  model: Model,
  state: Schema.TaggedUnion({ Reading: {}, Shown: {} }),
  message: Schema.TaggedUnion({
    KeptRead: { parts: Schema.NullOr(SetupParts) },
    LineChanged: { line: Line },
    Asked: {},
    Changed: { change: SetupChange },
    Answered: {
      since: Schema.Finite,
      accounts: Schema.Array(HarnessAccountInfo),
      harnesses: Schema.Array(HarnessInfo),
      models: Schema.Array(ModelsRead),
    },
    Refused: { since: Schema.Finite, reason: Schema.String },
    SpeechWatched: { state: SpeechToTextState },
    SeenRead: { marks: Marks },
    QuestionsHeard: { questions: Schema.Array(SessionQuestions) },
    AnsweringKept: { sessionId: Schema.String, answering: Answering },
  }),
});

const sameQuestions = Schema.toEquivalence(Schema.Array(SessionQuestions));

const nothing: SetupParts = {
  accounts: null,
  speech: null,
  harnesses: null,
  models: [],
};

const partsOf = (model: Model) => model.setup.value ?? nothing;

/** What it holds kept for its Account and Machine. */
const keep = (model: Model, parts: SetupParts) =>
  keepSetup({ accountId: model.accountId, machineId: model.machineId, parts });

/** 3. The accounts as a change Settings made leaves them. */
const changedAccounts = (
  accounts: ReadonlyArray<typeof HarnessAccountInfo.Type>,
  change: SetupChange,
) =>
  change._tag === 'AccountRemoved'
    ? accounts.filter(({ id }) => id !== change.id)
    : accounts.some(({ id }) => id === change.account.id)
      ? accounts.map((each) =>
          each.id === change.account.id ? change.account : each,
        )
      : [...accounts, change.account];

/** What it shares in `Machines`. */
const sharedOf = (model: Model, shown: boolean): Setup => ({
  ...partsOf(model),
  savedRead: shown,
  problem: model.setup.problem,
});

/** 6. Sync: its Replicas, said in `Machines` while it runs, by its id. */
const said = (machineId: string) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const replicas = yield* Replicas;
      const link = yield* Link;
      yield* Effect.acquireRelease(
        SubscriptionRef.update(link.replicas, (now) => ({
          ...now,
          [machineId]: replicas,
        })),
        () =>
          SubscriptionRef.update(link.replicas, (now) => {
            const { [machineId]: _gone, ...rest } = now;
            return rest;
          }),
      );
    }),
  );

export const MachineLive = Actor.build(Machine, {
  init: ({ accountId, machineId }) => ({
    model: {
      accountId,
      machineId,
      setup: copying.empty,
      line: 'connecting',
      seen: null,
      questions: [],
      answering: {},
    },
    state: { _tag: 'Reading' },
  }),
  // 6. Sync: its own Store, and the Replicas over it.
  provides: (self) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const { model } = yield* self.get;
        const sync = yield* Sync;
        return said(model.machineId).pipe(
          Layer.provideMerge(Replicas.layer),
          Layer.provideMerge(sync.store(model.accountId, model.machineId)),
        );
      }),
    ),
  children: {
    replicas: Replicas.child([CodeReplicaLive]),
  },
  workers: {
    line: {
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Stream.runForEach(CodeClients.connection(model.machineId), (line) =>
            self.send({ _tag: 'LineChanged', line }),
          ),
        ),
    },
    requests: {
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const { setupsAsked } = yield* Link;
          yield* Stream.fromPubSub(setupsAsked).pipe(
            Stream.filter(
              ({ machineId }) =>
                machineId === null || machineId === model.machineId,
            ),
            Stream.runForEach(({ ask }) =>
              self.send(
                ask._tag === 'Asked' ? ask : { _tag: 'Changed', change: ask },
              ),
            ),
          );
        }),
    },
    // 5. Seen
    seen: {
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const { accountId, machineId } = model;
          const seen = yield* Seen;
          yield* Stream.concat(
            Stream.make(undefined),
            seen.changes(accountId, machineId),
          ).pipe(
            Stream.mapEffect(() =>
              seen
                .read(accountId, machineId)
                .pipe(Effect.orElseSucceed((): Marks => ({}))),
            ),
            Stream.runForEach((marks) =>
              self.send({ _tag: 'SeenRead', marks }),
            ),
          );
        }),
    },
    // 8. Asked
    questions: {
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          questionsOn(model.machineId).pipe(
            Stream.changesWith(sameQuestions),
            Stream.runForEach((questions) =>
              self.send({ _tag: 'QuestionsHeard', questions: [...questions] }),
            ),
          ),
        ),
    },
    // 9. Answering
    answering: {
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const { answeringKept } = yield* Link;
          yield* Stream.fromPubSub(answeringKept).pipe(
            Stream.filter(({ machineId }) => machineId === model.machineId),
            Stream.runForEach(({ sessionId, answering }) =>
              self.send({ _tag: 'AnsweringKept', sessionId, answering }),
            ),
          );
        }),
    },
    // 7. Share
    publish: {
      run: (self) =>
        Effect.gen(function* () {
          const { known } = yield* Link;
          const { model } = yield* self.get;
          const id = model.machineId;
          yield* self.changes.pipe(
            Stream.map(({ model, state }) => ({
              setup: sharedOf(model, state._tag === 'Shown'),
              seen: model.seen,
              questions: model.questions,
              answering: model.answering,
            })),
            Stream.changes,
            Stream.runForEach(({ setup, seen, questions, answering }) =>
              SubscriptionRef.update(known, (now) => ({
                ...now,
                setups: { ...now.setups, [id]: setup },
                seen: seen === null ? now.seen : { ...now.seen, [id]: seen },
                questions:
                  now.questions[id] === questions
                    ? now.questions
                    : { ...now.questions, [id]: questions },
                answering:
                  now.answering[id] === answering
                    ? now.answering
                    : { ...now.answering, [id]: answering },
              })),
            ),
            Effect.ensuring(
              SubscriptionRef.update(known, (now) => {
                const { [id]: _setup, ...setups } = now.setups;
                const { [id]: _seen, ...seen } = now.seen;
                const { [id]: _questions, ...questions } = now.questions;
                const { [id]: _answering, ...answering } = now.answering;
                return { ...now, setups, seen, questions, answering };
              }),
            ),
          );
        }),
    },
  },
  state: {
    // 1. Kept
    Reading: {
      workers: {
        kept: {
          run: (self) =>
            Effect.gen(function* () {
              const { model } = yield* self.get;
              const parts = yield* (yield* Cache).read(SetupShelf, {
                accountId: model.accountId,
                machineId: model.machineId,
                projectId: null,
              });
              yield* self.send({ _tag: 'KeptRead', parts });
            }),
        },
      },
      on: {
        KeptRead: ({ parts }, { model }) => ({
          model: { ...model, setup: copying.read(model.setup, parts) },
          state: { _tag: 'Shown' },
        }),
      },
    },
    // 2. Ask
    Shown: {
      workers: {
        ask: {
          each: ({ model }) =>
            model.line === 'connected' ? copying.asking(model.setup) : [],
          run: (self, since) =>
            Effect.flatMap(self.get, ({ model }) =>
              Effect.flatMap(ask(model.machineId, Number(since)), self.send),
            ),
        },
        // 4. Speech: only once the kept copy shows, so a state heard
        // before it is read never stands in for it, and is never kept
        // over it.
        speech: {
          run: (self) =>
            Effect.flatMap(self.get, ({ model }) =>
              Stream.runForEach(speechOn(model.machineId), (state) =>
                self.send({ _tag: 'SpeechWatched', state }),
              ),
            ),
        },
      },
    },
  },
  on: {
    LineChanged: ({ line }, { model }) => ({
      model: {
        ...model,
        line,
        // Connected again: asked again, unless an ask still waits for it.
        setup:
          line === 'connected' &&
          model.line !== 'connected' &&
          model.setup.answered === model.setup.wanted
            ? copying.ask(model.setup)
            : model.setup,
      },
    }),
    Asked: (_, { model }) => ({
      model: { ...model, setup: copying.ask(model.setup) },
    }),
    // 3. Change
    Changed: ({ change }, { model }) => {
      const parts = partsOf(model);
      const next = {
        ...parts,
        accounts: changedAccounts(parts.accounts ?? [], change),
      };
      return {
        model: { ...model, setup: copying.changed(model.setup, next) },
        command: keep(model, next),
      };
    },
    // 2. Ask: an answer to an ask made before a later one, or a change, is dropped.
    Answered: ({ since, accounts, harnesses, models }, { model }) => {
      if (!copying.latest(model.setup, since)) return {};
      const before = partsOf(model);
      const parts = {
        accounts,
        harnesses,
        models: readOver(before.models, models),
        speech: before.speech,
      };
      return {
        model: { ...model, setup: copying.answered(model.setup, since, parts) },
        command: keep(model, parts),
      };
    },
    Refused: ({ since, reason }, { model }) => ({
      model: { ...model, setup: copying.refused(model.setup, since, reason) },
    }),
    // 4. Speech
    SpeechWatched: ({ state }, { model }) => {
      const before = partsOf(model);
      const progress =
        before.speech?._tag === 'Downloading' && state._tag === 'Downloading';
      const parts = { ...before, speech: state };
      return {
        model: { ...model, setup: { ...model.setup, value: parts } },
        ...(progress ? {} : { command: keep(model, parts) }),
      };
    },
    // 5. Seen
    SeenRead: ({ marks }, { model }) => ({ model: { ...model, seen: marks } }),
    // 8. Asked
    QuestionsHeard: ({ questions }, { model }) => ({
      model: {
        ...model,
        questions,
        answering: answeringAsked(model.answering, questions),
      },
    }),
    // 9. Answering: only what the feed still asks is kept.
    AnsweringKept: ({ sessionId, answering }, { model }) => ({
      model: {
        ...model,
        answering: answeringAsked(
          { ...model.answering, [sessionId]: answering },
          model.questions,
        ),
      },
    }),
  },
});
