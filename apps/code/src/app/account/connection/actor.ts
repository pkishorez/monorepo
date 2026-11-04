import { Effect, Layer, Schema, Stream } from 'effect';
import {
  CodeClients,
  CodeReplicaLive,
  HarnessAccountInfo,
  HarnessInfo,
  SessionJobs,
  SessionQuestions,
  SpeechToTextState,
} from '@kestack/connect/code';
import { PluginMismatch } from '@kestack/connect/cloud';
import { Actor } from '@kestack/kabuki';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Copy, copying, Marks, Storage } from '../../storage/index.ts';
import {
  Answering,
  Connections,
  ModelsRead,
  readOver,
  type Setup,
  SetupChange,
  SetupParts,
} from '../account.ts';
import { ask, speechOn } from './commands.ts';
import { Sockets } from './link/index.ts';
import { answeringAsked, jobsOn, questionsOn } from './records/index.ts';
import { keepSetup, SetupShelf } from './commands.ts';

/*
 * A Connection: one listed Connection of the Account, and what the app keeps of
 * it in its own database, `code:account:<accountId>:connection:<connectionId>`:
 * its setup, its Harness Accounts, its Speech to Text, and its agents with
 * each one's models; its Unseen marks; and its records, in its own sync
 * Store.
 *
 * 1. Kept    `Reading` reads the setup this device kept; `Shown` shows it
 *            at once, kept or not.
 * 2. Ask     then the Connection is asked again behind, once its Link is
 *            up, and again each time its Link is up, on
 *            Reload, and when Settings asks; its answer replaces what
 *            shows, a model list it refused keeping what showed, and is
 *            kept.
 * 3. Change  a change Settings made to the Connection shows at once, is kept,
 *            and the Connection is asked again, so an answer begun before it
 *            never undoes it.
 * 4. Speech  how Speech to Text stands, watched live once the kept copy
 *            shows, so it is shown over it, never in its place: each
 *            change shows and is kept, a download's progress only as it
 *            starts.
 * 5. Seen    its Unseen marks, read, and read again after every write,
 *            from this tab or another.
 * 6. Sync    its own Store, and the Replicas over it, Provided to the one
 *            Child that runs its Instance, and said through `Connections`, so
 *            a page, which is no Child of it, reads this Connection's records
 *            and no other's. The one socket to the Connection is its own
 *            too, opened in its own scope (`Sockets`): open while it runs,
 *            closed as it stops, as its Account leaves `Active` or the list
 *            leaves it out. Its Replicas sync over it, and the pages and
 *            Pickers borrow it through `Connections` while it runs.
 * 7. Share   its Link, and the Release it runs once it refused this
 *            Code's, its setup and marks, said to its Account's page
 *            through `Connections`, for Settings, the Dictation, the
 *            sidebar and each Project; what others ask of it is heard
 *            there too.
 * 8. Asked   the Agent Questions its Sessions' Turns wait on, whole on each
 *            change (`records/questions/`), shared in `Connections` too, for
 *            the sidebar's marks and the open session's Question Panel.
 *            Never kept: they live only while their Turn runs.
 * 10. Jobs   the Background Jobs its Sessions' agents run, whole on each
 *            change (`records/jobs/`), shared in `Connections` too, so a
 *            Session whose Turn has ended still shows as working while its
 *            jobs run. Never kept: they live only while their agent does.
 * 9. Answering how each is being answered here, as the Question Panel
 *            gives it: each Item's answer so far, minimised or not, tried
 *            or sent, so leaving the session or the page loses nothing.
 *            Kept here, in memory, while the question is asked, and
 *            shared in `Connections`; a question gone from the feed takes
 *            its part with it. Never written to storage: an answer may be
 *            a secret.
 */

const Link = Schema.Literals(['linking', 'linked', 'relinking']);

const Model = Schema.Struct({
  accountId: Schema.String,
  connectionId: Schema.String,
  setup: Copy(SetupParts),
  link: Link,
  /** The Release it said it runs as it closed a socket with a mismatch, until one is answered. */
  mismatch: Schema.NullOr(PluginMismatch.schema),
  /** Its Unseen marks; null until read. */
  seen: Schema.NullOr(Marks),
  /** Its Sessions' Agent Questions, as it last said them. */
  questions: Schema.Array(SessionQuestions.schema),
  /** How each Session's questions are being answered here, by Session id. */
  answering: Schema.Record(Schema.String, Answering),
  /** Its Sessions' Background Jobs, as it last said them. */
  jobs: Schema.Array(SessionJobs.schema),
});
type Model = typeof Model.Type;

const Connection = Actor.define('Connection', {
  requires: [CodeClients, Sockets, Storage, Connections],
  input: Schema.Struct({
    accountId: Schema.String,
    connectionId: Schema.String,
  }),
  model: Model,
  state: Schema.TaggedUnion({ Reading: {}, Shown: {} }),
  message: Schema.TaggedUnion({
    KeptRead: { parts: Schema.NullOr(SetupParts) },
    LinkChanged: { link: Link },
    Mismatched: { mismatch: Schema.NullOr(PluginMismatch.schema) },
    Asked: {},
    Changed: { change: SetupChange },
    Answered: {
      since: Schema.Finite,
      accounts: Schema.Array(HarnessAccountInfo.schema),
      harnesses: Schema.Array(HarnessInfo.schema),
      models: Schema.Array(ModelsRead),
    },
    Refused: { since: Schema.Finite, reason: Schema.String },
    SpeechWatched: { state: SpeechToTextState.schema },
    SeenRead: { marks: Marks },
    QuestionsHeard: { questions: Schema.Array(SessionQuestions.schema) },
    AnsweringKept: { sessionId: Schema.String, answering: Answering },
    JobsHeard: { jobs: Schema.Array(SessionJobs.schema) },
  }),
});

const sameJobs = Schema.toEquivalence(Schema.Array(SessionJobs.schema));

const sameQuestions = Schema.toEquivalence(
  Schema.Array(SessionQuestions.schema),
);

const nothing: SetupParts = {
  accounts: null,
  speech: null,
  harnesses: null,
  models: [],
};

const partsOf = (model: Model) => model.setup.value ?? nothing;

/** What it holds kept for its Account and Connection. */
const keep = (model: Model, parts: SetupParts) =>
  keepSetup({
    accountId: model.accountId,
    connectionId: model.connectionId,
    parts,
  });

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

/** What it shares in `Connections`. */
const sharedOf = (model: Model, shown: boolean): Setup => ({
  ...partsOf(model),
  savedRead: shown,
  problem: model.setup.problem,
});

/** 6. Sync: its Replicas and its sockets, said in `Connections` while it runs, by its id. */
const said = (connectionId: string) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const replicas = yield* Replicas;
      const clients = yield* CodeClients;
      yield* (yield* Connections).serve(connectionId, { replicas, clients });
    }),
  );

/** 6. Sync: the one socket to the Connection, open for as long as it runs. */
const socket = (connectionId: string) =>
  Layer.effect(
    CodeClients,
    Effect.gen(function* () {
      const clients = yield* (yield* Sockets).open;
      yield* clients.hold(connectionId);
      return clients;
    }),
  );

export const ConnectionLive = Connection.build({
  init: ({ accountId, connectionId }) => ({
    model: {
      accountId,
      connectionId,
      setup: copying.empty,
      link: 'linking',
      mismatch: null,
      seen: null,
      questions: [],
      answering: {},
      jobs: [],
    },
    state: { _tag: 'Reading' },
  }),
  // 6. Sync: its own Store, its socket, and the Replicas over them.
  provides: (self) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const { model } = yield* self.get;
        const storage = yield* Storage;
        return said(model.connectionId).pipe(
          Layer.provideMerge(Replicas.layer),
          Layer.provideMerge(
            storage.store(model.accountId, model.connectionId),
          ),
          Layer.provideMerge(socket(model.connectionId)),
        );
      }),
    ),
  children: {
    replicas: Actor.child(Replicas.actor([CodeReplicaLive])),
  },
  workers: {
    // 7. Share: its Link, and the Release it said it runs when it closed a
    // socket with a mismatch.
    link: {
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Stream.runForEach(CodeClients.link(model.connectionId), (link) =>
            self.send({ _tag: 'LinkChanged', link }),
          ),
        ),
    },
    mismatch: {
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Stream.runForEach(
            CodeClients.mismatch(model.connectionId),
            (mismatch) => self.send({ _tag: 'Mismatched', mismatch }),
          ),
        ),
    },
    // 3. Change, 9. Answering: what others ask of it.
    requests: {
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const connections = yield* Connections;
          yield* Stream.runForEach(
            connections.asked(model.connectionId),
            (ask) =>
              self.send(
                ask._tag === 'Asked' || ask._tag === 'AnsweringKept'
                  ? ask
                  : { _tag: 'Changed', change: ask },
              ),
          );
        }),
    },
    // 5. Seen
    seen: {
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const { accountId, connectionId } = model;
          const { seen } = yield* Storage;
          yield* Stream.concat(
            Stream.make(undefined),
            seen.changes(accountId, connectionId),
          ).pipe(
            Stream.mapEffect(() =>
              seen
                .read(accountId, connectionId)
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
          questionsOn(model.connectionId).pipe(
            Stream.changesWith(sameQuestions),
            Stream.runForEach((questions) =>
              self.send({ _tag: 'QuestionsHeard', questions: [...questions] }),
            ),
          ),
        ),
    },
    // 10. Jobs
    jobs: {
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          jobsOn(model.connectionId).pipe(
            Stream.changesWith(sameJobs),
            Stream.runForEach((jobs) =>
              self.send({ _tag: 'JobsHeard', jobs: [...jobs] }),
            ),
          ),
        ),
    },
    // 7. Share
    publish: {
      run: (self) =>
        Effect.gen(function* () {
          const connections = yield* Connections;
          const { model } = yield* self.get;
          yield* self.changes.pipe(
            Stream.map(({ model, state }) => ({
              link: model.link,
              mismatch: model.mismatch,
              setup: sharedOf(model, state._tag === 'Shown'),
              seen: model.seen,
              questions: model.questions,
              answering: model.answering,
              jobs: model.jobs,
            })),
            Stream.changes,
            Stream.runForEach((each) =>
              connections.say(model.connectionId, each),
            ),
          );
        }),
    },
  },
  states: {
    // 1. Kept
    Reading: {
      workers: {
        kept: {
          run: (self) =>
            Effect.gen(function* () {
              const { model } = yield* self.get;
              const parts = yield* (yield* Storage).cache.read(SetupShelf, {
                accountId: model.accountId,
                connectionId: model.connectionId,
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
            model.link === 'linked' ? copying.asking(model.setup) : [],
          run: (self, since) =>
            Effect.flatMap(self.get, ({ model }) =>
              Effect.flatMap(ask(model.connectionId, Number(since)), self.send),
            ),
        },
        // 4. Speech: only once the kept copy shows, so a state heard
        // before it is read never stands in for it, and is never kept
        // over it.
        speech: {
          run: (self) =>
            Effect.flatMap(self.get, ({ model }) =>
              Stream.runForEach(speechOn(model.connectionId), (state) =>
                self.send({ _tag: 'SpeechWatched', state }),
              ),
            ),
        },
      },
    },
  },
  on: {
    LinkChanged: ({ link }, { model }) => ({
      model: {
        ...model,
        link,
        // Linked again: asked again, unless an ask still waits for it.
        setup:
          link === 'linked' &&
          model.link !== 'linked' &&
          model.setup.answered === model.setup.wanted
            ? copying.ask(model.setup)
            : model.setup,
      },
    }),
    Mismatched: ({ mismatch }, { model }) => ({
      model: { ...model, mismatch },
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
    // 10. Jobs
    JobsHeard: ({ jobs }, { model }) => ({ model: { ...model, jobs } }),
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
