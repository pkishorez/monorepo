import { Effect, Schema, Stream, SubscriptionRef } from 'effect';
import {
  CodeClients,
  HarnessAccountInfo,
  HarnessInfo,
  SpeechToTextState,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import {
  Copy,
  copy,
  Kept,
  type Kit as Shared,
  KitChange,
  KitParts,
  Link,
  ModelsRead,
  readOver,
} from '../../../../layer/capabilities/index.ts';
import { ask, speechOn } from './api.ts';
import { KitShelf, keepKit } from './commands.ts';

/*
 * A Machine Kit: what the app keeps of one listed Machine, its Harness
 * Accounts, its Speech to Text, and its agents with each one's models.
 *
 * 1. Saved   `Reading` reads what this device kept of it; `Shown` shows
 *            it at once, kept or not.
 * 2. Ask     then the Machine is asked again behind, once its Line is
 *            connected, and again each time its Line connects, on
 *            Reload, and when Settings asks; its answer replaces what
 *            shows, a model list it refused keeping what showed, and is
 *            kept.
 * 3. Change  a change Settings made to the Machine shows at once, is kept,
 *            and the Machine is asked again, so an answer begun before it
 *            never undoes it.
 * 4. Speech  how Speech to Text stands, watched live: each change shows
 *            and is kept, a download's progress only as it starts.
 * 5. Share   what it holds is its Machine's Kit in `Machines`, for
 *            Settings, the Dictation and each Project; it is taken out as
 *            the Kit goes.
 */

const Line = Schema.Literals(['connecting', 'connected', 'reconnecting']);

const Model = Schema.Struct({
  accountId: Schema.String,
  machineId: Schema.String,
  kit: Copy(KitParts),
  line: Line,
});
type Model = typeof Model.Type;

const Kit = Actor.define('MachineKit', {
  requires: [CodeClients, Kept, Link],
  input: Schema.Struct({ accountId: Schema.String, machineId: Schema.String }),
  model: Model,
  state: Schema.TaggedUnion({ Reading: {}, Shown: {} }),
  message: Schema.TaggedUnion({
    SavedRead: { parts: Schema.NullOr(KitParts) },
    LineChanged: { line: Line },
    Asked: {},
    Changed: { change: KitChange },
    Answered: {
      since: Schema.Finite,
      accounts: Schema.Array(HarnessAccountInfo),
      harnesses: Schema.Array(HarnessInfo),
      models: Schema.Array(ModelsRead),
    },
    Refused: { since: Schema.Finite, reason: Schema.String },
    SpeechWatched: { state: SpeechToTextState },
  }),
});

const nothing: KitParts = {
  accounts: null,
  speech: null,
  harnesses: null,
  models: [],
};

const partsOf = (model: Model) => model.kit.value ?? nothing;

/** What it holds kept for its Account and Machine. */
const keep = (model: Model, parts: KitParts) =>
  keepKit({ accountId: model.accountId, machineId: model.machineId, parts });

/** 3. The accounts as a change Settings made leaves them. */
const changedAccounts = (
  accounts: ReadonlyArray<typeof HarnessAccountInfo.Type>,
  change: KitChange,
) =>
  change._tag === 'AccountRemoved'
    ? accounts.filter(({ id }) => id !== change.id)
    : accounts.some(({ id }) => id === change.account.id)
      ? accounts.map((each) =>
          each.id === change.account.id ? change.account : each,
        )
      : [...accounts, change.account];

/** What it shares in `Machines`. */
const sharedOf = (model: Model, shown: boolean): Shared => ({
  ...partsOf(model),
  savedRead: shown,
  problem: model.kit.problem,
});

export const KitLive = Actor.build(Kit, {
  init: ({ accountId, machineId }) => ({
    model: { accountId, machineId, kit: copy.empty, line: 'connecting' },
    state: { _tag: 'Reading' },
  }),
  workers: {
    line: {
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Stream.runForEach(CodeClients.connection(model.machineId), (line) =>
            self.send({ _tag: 'LineChanged', line }),
          ),
        ),
    },
    // 4. Speech
    speech: {
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Stream.runForEach(speechOn(model.machineId), (state) =>
            self.send({ _tag: 'SpeechWatched', state }),
          ),
        ),
    },
    requests: {
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const { kitsAsked } = yield* Link;
          yield* Stream.fromPubSub(kitsAsked).pipe(
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
    // 5. Share
    publish: {
      run: (self) =>
        Effect.gen(function* () {
          const { known } = yield* Link;
          const { model } = yield* self.get;
          const id = model.machineId;
          yield* self.changes.pipe(
            Stream.map(({ model, state }) =>
              sharedOf(model, state._tag === 'Shown'),
            ),
            Stream.changes,
            Stream.runForEach((kit) =>
              SubscriptionRef.update(known, (now) => ({
                ...now,
                kits: { ...now.kits, [id]: kit },
              })),
            ),
            Effect.ensuring(
              SubscriptionRef.update(known, (now) => {
                const { [id]: _gone, ...kits } = now.kits;
                return { ...now, kits };
              }),
            ),
          );
        }),
    },
  },
  state: {
    // 1. Saved
    Reading: {
      workers: {
        saved: {
          run: (self) =>
            Effect.gen(function* () {
              const { model } = yield* self.get;
              const parts = yield* (yield* Kept).read(KitShelf, {
                accountId: model.accountId,
                machineId: model.machineId,
                projectId: null,
              });
              yield* self.send({ _tag: 'SavedRead', parts });
            }),
        },
      },
      on: {
        SavedRead: ({ parts }, { model }) => ({
          model: { ...model, kit: copy.saved(model.kit, parts) },
          state: { _tag: 'Shown' },
        }),
      },
    },
    // 2. Ask
    Shown: {
      workers: {
        ask: {
          each: ({ model }) =>
            model.line === 'connected' ? copy.asking(model.kit) : [],
          run: (self, since) =>
            Effect.flatMap(self.get, ({ model }) =>
              Effect.flatMap(ask(model.machineId, Number(since)), self.send),
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
        kit:
          line === 'connected' &&
          model.line !== 'connected' &&
          model.kit.answered === model.kit.wanted
            ? copy.ask(model.kit)
            : model.kit,
      },
    }),
    Asked: (_, { model }) => ({
      model: { ...model, kit: copy.ask(model.kit) },
    }),
    // 3. Change
    Changed: ({ change }, { model }) => {
      const parts = partsOf(model);
      const next = {
        ...parts,
        accounts: changedAccounts(parts.accounts ?? [], change),
      };
      return {
        model: { ...model, kit: copy.changed(model.kit, next) },
        command: keep(model, next),
      };
    },
    // 2. Ask: an answer to an ask made before a later one, or a change, is dropped.
    Answered: ({ since, accounts, harnesses, models }, { model }) => {
      if (!copy.latest(model.kit, since)) return {};
      const before = partsOf(model);
      const parts = {
        accounts,
        harnesses,
        models: readOver(before.models, models),
        speech: before.speech,
      };
      return {
        model: { ...model, kit: copy.answered(model.kit, since, parts) },
        command: keep(model, parts),
      };
    },
    Refused: ({ since, reason }, { model }) => ({
      model: { ...model, kit: copy.refused(model.kit, since, reason) },
    }),
    // 4. Speech
    SpeechWatched: ({ state }, { model }) => {
      const before = partsOf(model);
      const progress =
        before.speech?._tag === 'Downloading' && state._tag === 'Downloading';
      const parts = { ...before, speech: state };
      return {
        model: { ...model, kit: { ...model.kit, value: parts } },
        ...(progress ? {} : { command: keep(model, parts) }),
      };
    },
  },
});
