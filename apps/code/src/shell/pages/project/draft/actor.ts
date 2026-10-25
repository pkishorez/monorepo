import { Effect, Layer, Schema, Stream } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
import { CodeClient } from '@kestack/connect/code';
import { Actor, type Self as Kabuki, type Single } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { session } from '../../../routes/index.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import {
  type Place,
  SavedDraft,
  SavedDrafts,
  Written,
} from '../../../../layer/capabilities/index.ts';
import { Catalog, SharedCatalog } from '../capabilities/index.ts';
import { ask, retryCatalog, send, startSession } from './commands.ts';
import { Attached, Insert, wire } from './message.ts';
import { DraftMode, type Mode, type Outcome } from './mode/index.ts';
import { ModelPicker } from './model-picker/index.ts';
import {
  forget,
  forgetUnsent,
  keeps,
  keepWritten,
  restoredOf,
  Where,
  workers,
} from './saved.ts';
import { SkillPicker } from './skills.ts';

/*
 * The Draft: the next message of a page, a new session's first or an open
 * Session's next, with what goes with it. It is its own Actor, so typing
 * into it, picking for it or dictating into it draws only it.
 *
 * 1. Catalog  the agents, their models and Skills, as the project shares
 *             them; nothing waits for them. When they cannot be read the
 *             Draft says why, and opening the skills Picker again asks the
 *             project to read them again.
 * 2. Write    in its Draft Mode, a Child each (`mode/`): a Message, or,
 *             in a Session, a Side Question, each the one owner of its
 *             text, cursor and selection, which it hands up only to send
 *             or keep. The Draft keeps the mode open, the Message's files
 *             and every Insert, numbered, for the editor of the mode open
 *             to put in once at its cursor: a paste, a drop, a Dictation,
 *             a Skill.
 * 3. Pick     the model Picker sets the agent, its model and settings, each
 *             its default until picked; a new agent starts from its own. A
 *             Session keeps its agent, and what is picked goes with every
 *             message from then on. On touch the model chip sets a
 *             setting in place, with no Picker. The skills Picker puts a
 *             `/name` in. One Picker is open at a time, each a fresh one.
 * 4. Send     a mode hands its text up. A new session's Draft starts the
 *             session, already running its first message, and the app
 *             moves to it. A Session's Message goes to the server, which
 *             starts a turn or steers the running one, kept apart until
 *             answered; refused, its files come back here, its text to the
 *             mode. In Side Question mode the question is asked on the
 *             side, answered by the Session's own agent; a new one
 *             replaces the last and its answer, and nothing of it is kept.
 *             A Message that starts with `/btw`, or a `btw ` typed in the
 *             skills Picker, carries the rest to a fresh Side Question.
 * 5. Keep     the Draft is kept on this device as a Saved Draft
 *             (`saved.ts`), under the Account it opened with: read back
 *             before it is drawn; each part kept by its owner after each
 *             change and as the page is left, a Message sent held until
 *             answered. A Session's is forgotten once a Message sent is
 *             taken with nothing written since; a new session's, once the
 *             session starts.
 */

/** A Session's agent (its Harness Account), model and settings, as its row says them. */
const Agent = Schema.Struct({
  account: Schema.String,
  model: Schema.String,
  settings: Schema.Record(Schema.String, Schema.String),
});

/** Where the Draft goes: a new session in the project, or an open Session. */
const To = Schema.TaggedUnion({
  NewSession: {},
  Session: {
    sessionId: Schema.String,
    /** null until the Session's row is read. */
    agent: Schema.NullOr(Agent),
    running: Schema.Boolean,
  },
});

const Props = Schema.Struct({
  machineId: Schema.String,
  projectId: Schema.String,
  to: To,
});
type Props = typeof Props.Type;

const Picking = Schema.TaggedUnion({
  /** `typed`: opened by a `/` typed in the Composer, which the skill takes the place of. */
  Skills: { how: Picker.How, typed: Schema.Boolean },
  Model: { how: Picker.How, at: ModelPicker.At },
});

/** What the model Picker set; null: as it was. */
const Chosen = Schema.Struct({
  /** The Harness Account picked. */
  account: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  settings: Schema.Record(Schema.String, Schema.String),
});

/** A Message sent, kept until the server answers; `refused`: why, until its mode has it back. */
const Unsent = Schema.Struct({
  id: Schema.Finite,
  attachments: Schema.Array(Attached),
  refused: Schema.NullOr(Schema.String),
});

const Asked = Schema.Struct({
  id: Schema.Finite,
  question: Schema.String,
  /** null while it is being answered, or when it failed. */
  answer: Schema.NullOr(Schema.String),
  problem: Schema.NullOr(Schema.String),
});

const Handed = Schema.Struct({
  id: Schema.String,
  taken: Schema.Boolean,
  send: Schema.NullOr(Schema.Finite),
});

/** How many texts handed up are remembered. */
const HANDED = 8;

/** What a mode starts from; `changed`: not kept yet, as a question carried over. */
const Opening = Schema.Struct({ ...Written.fields, changed: Schema.Boolean });

const Model = Schema.Struct({
  /** Its Saved Draft has been read back. */
  restored: Schema.Boolean,
  /** The Account and place it is kept under, fixed once read back; null with nobody signed in. */
  where: Schema.NullOr(Where),
  /** How many changes to its own parts there were to keep, and how many are kept. */
  changes: Schema.Finite,
  kept: Schema.Finite,
  /** The Draft Mode open. */
  mode: DraftMode.Mode,
  /** What each mode starts from, as read back or carried over; the mode owns it after. */
  opening: Schema.Struct({ Message: Opening, SideQuestion: Opening }),
  /** How many questions were carried to a fresh Side Question. */
  carried: Schema.Finite,
  attachments: Schema.Array(Attached),
  /** The last thing put in, for its editor to put in at its cursor. */
  insert: Schema.NullOr(Insert.Schema),
  catalog: Catalog.Model,
  /** Picked here; any left null is the agent's own, or its default. */
  chosen: Chosen,
  /** The Picker open, if one is. */
  picking: Schema.NullOr(Picking),
  /** How many Pickers were opened, so each is a fresh one. */
  opened: Schema.Finite,
  /** Why the last start or send went wrong, until the next. */
  problem: Schema.NullOr(Schema.String),
  /** A new session is being started, or has started. */
  starting: Schema.Boolean,
  /** Sent and not yet answered, oldest first. */
  unsent: Schema.Array(Unsent),
  /** How many were sent: each send's id. */
  sends: Schema.Finite,
  asked: Schema.NullOr(Asked),
  /** The last question's id: a late answer to a dismissed one is told apart. */
  asks: Schema.Finite,
  /** The last texts handed up, whether each was taken, and the send it became. */
  handed: Schema.Array(Handed),
});
type Model = typeof Model.Type;

const Message = Schema.TaggedUnion({
  CatalogRead: { catalog: Catalog.Model },
  CatalogRetryAsked: {},
  ModeAsked: { mode: DraftMode.Mode },
  AttachmentsChanged: { attachments: Schema.Array(Attached) },
  InsertAsked: { what: Insert.What },
  PickerOpened: { picking: Picking },
  PickerClosed: {},
  ModelChosen: { chosen: Chosen },
  SettingChosen: { key: Schema.String, value: Schema.String },
  SkillChosen: { name: Schema.String },
  /** A mode handed up its text: to send, start with or ask; `handed` tells it apart. */
  SendAsked: {
    mode: DraftMode.Mode,
    text: Schema.String,
    handed: Schema.String,
  },
  /** A Message started with `/btw`. */
  BtwAsked: { question: Schema.String },
  /** A mode's text changed since the last problem. */
  Retyped: {},
  Started: { sessionId: Schema.String },
  StartRefused: { reason: Schema.String },
  Sent: { id: Schema.Finite },
  SendRefused: { id: Schema.Finite, key: Schema.String, reason: Schema.String },
  /** Its mode has the text of a refused send back. */
  RefusalTaken: { id: Schema.Finite },
  Answered: { id: Schema.Finite, answer: Schema.String },
  AskRefused: { id: Schema.Finite, reason: Schema.String },
  Restored: { where: Schema.NullOr(Where), draft: Schema.NullOr(SavedDraft) },
  Kept: { changes: Schema.Finite },
});

const Draft = Actor.define('Draft', {
  requires: [CodeClient, SharedCatalog, Navigation, SavedDrafts, Accounts],
  props: Props,
  model: Model,
  message: Message,
});

/** `/` entries that are not skills, for a Session's Draft. */
const COMMANDS = [
  {
    name: 'btw',
    description: 'Ask about this session without interrupting it',
  },
];

/** What the model Picker is handed before anything is known, which it never opens for. */
const NOBODY = { account: '', model: null, settings: {} };

/** A new session's agent, as the catalog describes it: the one picked, else the first that runs. */
export const pickedHarness = ({ catalog, chosen }: Model) =>
  Catalog.harnessOf(catalog, chosen.account) ??
  catalog.harnesses?.find(({ available }) => available) ??
  catalog.harnesses?.[0] ??
  null;

/** A new session's model: the one picked, or its agent's default. */
export const pickedModel = (model: Model) =>
  model.chosen.model ?? pickedHarness(model)?.defaultModel ?? null;

/** A new session's settings: each the one picked, or its default. */
const pickedSettings = (model: Model): Record<string, string> =>
  Object.fromEntries(
    (pickedHarness(model)?.settings ?? []).map(({ key, default: value }) => [
      key,
      model.chosen.settings[key] ?? value,
    ]),
  );

/** The agent, model and settings in effect, for the model Picker; null until they are known. */
export const current = (model: Model, { to }: Props) => {
  if (to._tag === 'Session')
    return to.agent === null
      ? null
      : {
          account: to.agent.account,
          model: model.chosen.model ?? to.agent.model,
          settings: { ...to.agent.settings, ...model.chosen.settings },
        };
  const harness = pickedHarness(model);
  return harness === null
    ? null
    : {
        account: harness.account,
        model: model.chosen.model,
        settings: model.chosen.settings,
      };
};

/** The agent's Skills, and a Session's commands, as the skills Picker lists them. */
export const skillsOf = (model: Model, props: Props) => {
  const account = current(model, props)?.account ?? null;
  const read = Catalog.skillsOf(model.catalog, account);
  const loading =
    read === undefined &&
    (props.to._tag === 'Session' ||
      (model.catalog.harnesses === null
        ? model.catalog.problem === null
        : pickedHarness(model)?.available === true));
  return {
    commands: props.to._tag === 'Session' ? COMMANDS : [],
    skills: read?.list ?? [],
    loading,
    problem: read?.problem ?? null,
  };
};

/** The modes this Draft has. */
export const modesOf = ({ to }: Props) =>
  DraftMode.modesOf(to._tag === 'Session');

/** A mode Child's key: a Side Question carried over to is a fresh one. */
const keyOf = (mode: Mode, carried: number) =>
  mode === 'SideQuestion' && carried > 0 ? `${mode} ${carried}` : mode;

/** The mode a Child's key names. */
const modeOfKey = (key: string): Mode =>
  key.startsWith('SideQuestion') ? 'SideQuestion' : 'Message';

/** Where its Saved Draft is kept. */
const placeOf = ({ machineId, projectId, to }: Props): Place => ({
  machineId,
  projectId,
  sessionId: to._tag === 'Session' ? to.sessionId : null,
});

/** One more change to keep. */
const changed = (model: Model): Model => ({
  ...model,
  changes: model.changes + 1,
});

// 4. Send: a new session.
const start = (model: Model, props: Props, written: string) => {
  const text = written.trim();
  const harness = pickedHarness(model);
  const picked = pickedModel(model);
  if (model.starting || harness === null || picked === null) return {};
  if (!harness.available)
    return {
      model: {
        ...model,
        problem:
          harness.unavailableReason ?? 'This agent cannot run on this machine',
      },
    };
  if (text === '' && model.attachments.length === 0)
    return { model: { ...model, problem: 'Write the first message' } };
  return {
    model: { ...model, starting: true, problem: null },
    command: startSession({
      projectId: props.projectId,
      account: harness.account,
      model: picked,
      settings: pickedSettings(model),
      text,
      attachments: wire(model.attachments),
    }),
  };
};

// 4. Send: a Side Question.
const askOf = (model: Model, sessionId: string, text: string) => {
  const question = text.trim();
  if (question === '') return {};
  const id = model.asks + 1;
  return {
    model: {
      ...model,
      problem: null,
      asked: { id, question, answer: null, problem: null },
      asks: id,
    },
    command: ask({ id, sessionId, question }),
  };
};

// 4. Send: a Session's Message; its files emptied are kept with its send.
const sendTo = (model: Model, sessionId: string, written: string) => {
  const text = written.trim();
  if (text === '' && model.attachments.length === 0) return {};
  const id = model.sends + 1;
  const { chosen } = model;
  return {
    model: {
      ...model,
      attachments: [],
      kept: model.changes,
      unsent: [
        ...model.unsent,
        { id, attachments: model.attachments, refused: null },
      ],
      sends: id,
      problem: null,
    },
    command: send({
      id,
      where: model.where,
      sessionId,
      text,
      attachments: model.attachments,
      ...(chosen.model === null ? {} : { model: chosen.model }),
      ...(Object.keys(chosen.settings).length === 0
        ? {}
        : { settings: chosen.settings }),
    }),
  };
};

type Self = Kabuki<Model, Single, typeof Message.Type, Props>;

/** The first value `pick` finds in the Draft as it changes. */
const first = <A>(
  self: Self,
  pick: (model: Model) => A | undefined,
): Effect.Effect<A | undefined> =>
  self.changes.pipe(
    Stream.map(({ model }) => pick(model)),
    Stream.filter((found) => found !== undefined),
    Stream.runHead,
    Effect.map((found) => (found._tag === 'Some' ? found.value : undefined)),
  );

/**
 * 4. Send: a mode's text handed up, and what became of it: a Session's
 * Message waits for the server's answer.
 */
const handedUp = (self: Self, mode: Mode, text: string) =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    yield* self.send({ _tag: 'SendAsked', mode, text, handed: id });
    const handed = yield* first(self, ({ handed }) =>
      handed.find((each) => each.id === id),
    );
    if (handed === undefined || !handed.taken)
      return { _tag: 'Untaken' } satisfies Outcome;
    const { send } = handed;
    if (send === null) return { _tag: 'Taken' } satisfies Outcome;
    const refused = yield* first(self, ({ unsent }) => {
      const each = unsent.find((one) => one.id === send);
      return each === undefined ? null : (each.refused ?? undefined);
    });
    if (refused === null || refused === undefined)
      return { _tag: 'Sent' } satisfies Outcome;
    yield* self.send({ _tag: 'RefusalTaken', id: send });
    return { _tag: 'Refused', reason: refused } satisfies Outcome;
  });

const keep = workers(placeOf);

export const DraftLive = Actor.build(Draft, {
  init: () => ({
    model: {
      restored: false,
      where: null,
      changes: 0,
      kept: 0,
      mode: 'Message',
      opening: {
        Message: { ...DraftMode.blank, changed: false },
        SideQuestion: { ...DraftMode.blank, changed: false },
      },
      carried: 0,
      attachments: [],
      insert: null,
      catalog: Catalog.empty,
      chosen: { account: null, model: null, settings: {} },
      picking: null,
      opened: 0,
      problem: null,
      starting: false,
      unsent: [],
      sends: 0,
      asked: null,
      asks: 0,
      handed: [],
    },
  }),
  provides: (self) =>
    Layer.mergeAll(
      // 3. Pick
      SkillPicker.owner((name) =>
        self.send(
          name === null
            ? { _tag: 'PickerClosed' }
            : { _tag: 'SkillChosen', name },
        ),
      ),
      ModelPicker.owner((chosen) =>
        self.send(
          chosen === null
            ? { _tag: 'PickerClosed' }
            : { _tag: 'ModelChosen', chosen },
        ),
      ),
      // 2. Write, 4. Send, 5. Keep: what each mode hands up.
      DraftMode.owner(
        Effect.map(SavedDrafts, (saved) => ({
          keep: (mode: Mode, written: Written, at: number) =>
            Effect.gen(function* () {
              const { model } = yield* self.get;
              if (!keeps(model) || model.where === null) return;
              if (model.problem !== null) yield* self.send({ _tag: 'Retyped' });
              yield* keepWritten(model.where, at, mode, written).pipe(
                Effect.provideService(SavedDrafts, saved),
              );
            }),
          send: (mode: Mode, text: string) => handedUp(self, mode, text),
          btw: (question: string) => self.send({ _tag: 'BtwAsked', question }),
        })),
      ),
    ),
  children: {
    // 2. Write: one Child per Draft Mode, once its Saved Draft is read back.
    modes: {
      actor: DraftMode.actor,
      each: ({ model, props }) =>
        model.restored
          ? modesOf(props).map((mode) => keyOf(mode, model.carried))
          : [],
      input: ({ model }, key) => model.opening[modeOfKey(key)],
      props: ({ props }, key) => {
        const session = props.to._tag === 'Session';
        const mode = modeOfKey(key);
        return { mode, clears: session, btw: session && mode === 'Message' };
      },
    },
    skills: {
      actor: SkillPicker.Live,
      while: ({ model }) => model.picking?._tag === 'Skills',
      key: ({ model }) => String(model.opened),
      input: ({ model }) => SkillPicker.opening(model.picking?.how ?? 'keys'),
      props: ({ model, props }) => skillsOf(model, props),
    },
    models: {
      actor: ModelPicker.Live,
      while: ({ model, props }) =>
        model.picking?._tag === 'Model' && current(model, props) !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model, props }) =>
        ModelPicker.opening({
          how: model.picking?.how ?? 'keys',
          at: model.picking?._tag === 'Model' ? model.picking.at : 'model',
          started: props.to._tag === 'Session',
          catalog: model.catalog,
          current: current(model, props) ?? NOBODY,
        }),
      props: ({ model, props }) => ({
        catalog: model.catalog,
        current: current(model, props) ?? NOBODY,
        alone:
          model.picking?._tag === 'Model' &&
          (model.picking.at === 'agent' || model.picking.at === 'modelAlone'),
      }),
    },
  },
  workers: {
    // 5. Keep
    ...keep,
    // 1. Catalog
    catalog: {
      run: (self) =>
        Stream.runForEach(
          Stream.unwrap(Effect.map(SharedCatalog, ({ changes }) => changes)),
          (catalog) => self.send({ _tag: 'CatalogRead', catalog }),
        ),
    },
  },
  on: {
    CatalogRead: ({ catalog }, { model }) => ({ model: { ...model, catalog } }),
    CatalogRetryAsked: () => ({ command: retryCatalog() }),
    // 5. Keep: what came back of a refused Message is held again, not kept apart.
    Restored: ({ where, draft }, { model, props }) => {
      if (draft === null) return { model: { ...model, where, restored: true } };
      const { parts, opening, refused, back } = restoredOf(
        draft,
        modesOf(props),
      );
      return {
        model: {
          ...model,
          ...parts,
          opening: {
            Message: { ...opening.Message, changed: back.length > 0 },
            SideQuestion: { ...opening.SideQuestion, changed: false },
          },
          where,
          restored: true,
          problem: refused,
          changes: back.length === 0 ? model.changes : model.changes + 1,
        },
        ...(where === null || back.length === 0
          ? {}
          : { command: forgetUnsent({ where, keys: back }) }),
      };
    },
    Kept: ({ changes }, { model }) => ({
      model: { ...model, kept: Math.max(model.kept, changes) },
    }),
    // 2. Write
    ModeAsked: ({ mode }, { model, props }) =>
      !modesOf(props).includes(mode) || model.mode === mode
        ? {}
        : {
            model: {
              ...changed(model),
              mode,
              picking: null,
              problem: null,
            },
          },
    AttachmentsChanged: ({ attachments }, { model }) => ({
      model: { ...changed(model), attachments, problem: null },
    }),
    InsertAsked: ({ what }, { model }) => ({
      model: { ...model, insert: Insert.next(model.insert, what) },
    }),
    Retyped: (_, { model }) => ({ model: { ...model, problem: null } }),
    // 4. Send: `/btw` carries the rest to a fresh Side Question.
    BtwAsked: ({ question }, { model, props }) =>
      !modesOf(props).includes('SideQuestion')
        ? {}
        : {
            model: {
              ...changed(model),
              mode: 'SideQuestion',
              picking: null,
              problem: null,
              opening: {
                ...model.opening,
                SideQuestion: {
                  ...DraftMode.writtenOf(question),
                  changed: true,
                },
              },
              carried: model.carried + 1,
            },
          },
    // 3. Pick
    PickerOpened: ({ picking }, { model, props }) =>
      model.picking !== null ||
      !DraftMode.takes(model.mode)[
        picking._tag === 'Skills' ? 'skills' : 'picks'
      ]
        ? {}
        : {
            model: { ...model, picking, opened: model.opened + 1 },
            ...(picking._tag === 'Skills' &&
            skillsOf(model, props).problem !== null
              ? { command: retryCatalog() }
              : {}),
          },
    PickerClosed: (_, { model }) => ({ model: { ...model, picking: null } }),
    SkillChosen: ({ name }, { model }) =>
      model.picking?._tag !== 'Skills'
        ? {}
        : {
            model: {
              ...model,
              picking: null,
              insert: Insert.next(model.insert, {
                _tag: 'Skill',
                name,
                typed: model.picking.typed,
              }),
            },
          },
    ModelChosen: ({ chosen }, { model, props }) => {
      // A Session keeps its agent; a new agent starts from its own.
      const harness =
        props.to._tag === 'Session'
          ? null
          : Catalog.harnessOf(model.catalog, chosen.account);
      const fresh =
        harness !== null && harness.account !== pickedHarness(model)?.account;
      return {
        model: {
          ...changed(model),
          picking: null,
          problem: null,
          chosen: {
            account: harness?.account ?? model.chosen.account,
            model: chosen.model ?? (fresh ? null : model.chosen.model),
            settings: {
              ...(fresh ? {} : model.chosen.settings),
              ...chosen.settings,
            },
          },
        },
      };
    },
    SettingChosen: ({ key, value }, { model }) => ({
      model: {
        ...changed(model),
        problem: null,
        chosen: {
          ...model.chosen,
          settings: { ...model.chosen.settings, [key]: value },
        },
      },
    }),
    // 4. Send
    SendAsked: ({ mode, text, handed }, { model, props }) => {
      const message = props.to._tag === 'Session' && mode === 'Message';
      const done =
        props.to._tag === 'NewSession'
          ? start(model, props, text)
          : mode === 'SideQuestion'
            ? askOf(model, props.to.sessionId, text)
            : sendTo(model, props.to.sessionId, text);
      const next = done.model ?? model;
      const taken = 'command' in done;
      return {
        ...done,
        model: {
          ...next,
          handed: [
            ...next.handed.slice(1 - HANDED),
            { id: handed, taken, send: taken && message ? next.sends : null },
          ],
        },
      };
    },
    // 5. Keep: started, its Project's Saved Draft goes, and is kept no more.
    Started: ({ sessionId }, { model, props }) => ({
      model: { ...model, attachments: [] },
      command: [
        Router.push(session(props.machineId, props.projectId, sessionId)),
        ...(model.where === null ? [] : [forget({ where: model.where })]),
      ],
    }),
    StartRefused: ({ reason }, { model }) => ({
      model: { ...model, starting: false, problem: reason },
    }),
    Sent: ({ id }, { model }) => ({
      model: {
        ...model,
        unsent: model.unsent.filter((each) => each.id !== id),
      },
    }),
    // 5. Keep: refused while the Draft is here, its text comes back to its
    // mode, not from the Saved Draft.
    SendRefused: ({ id, key, reason }, { model }) => {
      const refused = model.unsent.find((each) => each.id === id);
      return {
        model: {
          ...changed(model),
          problem: reason,
          attachments: [...(refused?.attachments ?? []), ...model.attachments],
          unsent: model.unsent.map((each) =>
            each.id === id ? { ...each, refused: reason } : each,
          ),
        },
        ...(model.where === null
          ? {}
          : { command: forgetUnsent({ where: model.where, keys: [key] }) }),
      };
    },
    RefusalTaken: ({ id }, { model }) => ({
      model: {
        ...model,
        unsent: model.unsent.filter((each) => each.id !== id),
      },
    }),
    Answered: ({ id, answer }, { model }) =>
      model.asked?.id === id
        ? { model: { ...model, asked: { ...model.asked, answer } } }
        : {},
    AskRefused: ({ id, reason }, { model }) =>
      model.asked?.id === id
        ? { model: { ...model, asked: { ...model.asked, problem: reason } } }
        : {},
  },
});
