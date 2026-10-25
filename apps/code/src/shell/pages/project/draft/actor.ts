import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClient } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { session } from '../../../routes/index.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import {
  type Place,
  SavedDraft,
  SavedDrafts,
} from '../../../../layer/capabilities/index.ts';
import { Catalog, SharedCatalog } from '../capabilities/index.ts';
import { btwQuestion } from './btw.ts';
import { ask, retryCatalog, send, startSession } from './commands.ts';
import { Attached, Insert, wire } from './message.ts';
import { DraftMode, type Mode, type Written } from './mode/index.ts';
import { ModelPicker } from './model-picker/index.ts';
import { forget, keep, leaving, restoredOf, savedOf } from './saved.ts';
import { SkillPicker } from './skills.ts';
import { TouchDraft } from './touch/index.ts';

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
 *             in a Session, a Side Question. Each keeps its own text,
 *             cursor and selection; the Draft keeps a copy of each as
 *             written, to act on, and its files. Every Insert put in is
 *             numbered, for its editor to put in once at the cursor of
 *             the mode open: a paste, a drop, a Dictation, a Skill.
 * 3. Pick     the model Picker sets the agent, its model and settings, each
 *             its default until picked; a new agent starts from its own. A
 *             Session keeps its agent, and what is picked goes with every
 *             message from then on. On touch the model chip sets a
 *             setting in place, with no Picker. The skills Picker puts a
 *             `/name` in.
 *             One Picker is open at a time, each a fresh one.
 * 4. Start    a new session's Draft starts the session, already running
 *             its first message, and the app moves to it.
 * 5. Send     a Session's Draft goes to the server, which starts a turn
 *             when the session is idle and steers the running one
 *             otherwise. It clears at once; refused, it comes back, each
 *             send kept apart until the server has answered it.
 * 6. Ask      in Side Question mode the Draft asks the Session on the
 *             side, text only, answered by its own agent and never part
 *             of the transcript; a new question replaces the last and its
 *             answer. A Message that starts with `/btw` switches to it,
 *             the rest carried over as the question. Nothing of it is
 *             kept.
 * 7. Keep     the Draft is kept on this device as a Saved Draft, for its
 *             Session, or its Project's new session: read back before it
 *             is drawn, kept a quarter of a second after the last change,
 *             and at once as the page is hidden or left. Not while a send
 *             is on its way: once a Message is sent, its Saved Draft is
 *             forgotten, both modes and what was picked; refused, the
 *             Draft comes back and is kept again.
 * 8. Touch    on a device with no keyboard it is drawn as the Touch Draft,
 *             a Child that keeps how it stands, and has it sent.
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

/** A message sent, kept until the server answers, to come back if refused. */
const Unsent = Schema.Struct({
  id: Schema.Finite,
  text: Schema.String,
  attachments: Schema.Array(Attached),
  /** The changes counted once it was sent: none since, its Saved Draft is only forgotten. */
  changes: Schema.Finite,
});

const Asked = Schema.Struct({
  id: Schema.Finite,
  question: Schema.String,
  /** null while it is being answered, or when it failed. */
  answer: Schema.NullOr(Schema.String),
  problem: Schema.NullOr(Schema.String),
});

/** Each mode's text as written, by mode. */
const ByMode = <S extends Schema.Top>(each: S) =>
  Schema.Struct({ Message: each, SideQuestion: each });

const Model = Schema.Struct({
  /** Its Saved Draft has been read back. */
  restored: Schema.Boolean,
  /** How many changes there were to keep, and how many are kept. */
  changes: Schema.Finite,
  kept: Schema.Finite,
  /** The Draft Mode open. */
  mode: DraftMode.Mode,
  /** What each mode holds, as last written. */
  written: ByMode(DraftMode.Written),
  /** The text the Draft last set each mode to, for it to take once. */
  resets: ByMode(Schema.NullOr(DraftMode.Reset)),
  /** How many resets were set: each one's id. */
  reset: Schema.Finite,
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
  /** A new session is being started. */
  starting: Schema.Boolean,
  /** Sent and not yet answered, oldest first: brought back if refused. */
  unsent: Schema.Array(Unsent),
  /** How many were sent: each send's id. */
  sends: Schema.Finite,
  asked: Schema.NullOr(Asked),
  /** The last question's id: a late answer to a dismissed one is told apart. */
  asks: Schema.Finite,
});
type Model = typeof Model.Type;

const Draft = Actor.define('Draft', {
  requires: [CodeClient, SharedCatalog, Navigation, SavedDrafts],
  props: Props,
  model: Model,
  message: Schema.TaggedUnion({
    CatalogRead: { catalog: Catalog.Model },
    CatalogRetryAsked: {},
    Written: { mode: DraftMode.Mode, ...DraftMode.Written.fields },
    ModeAsked: { mode: DraftMode.Mode },
    AttachmentsChanged: { attachments: Schema.Array(Attached) },
    InsertAsked: { what: Insert.What },
    PickerOpened: { picking: Picking },
    PickerClosed: {},
    ModelChosen: { chosen: Chosen },
    SettingChosen: { key: Schema.String, value: Schema.String },
    SkillChosen: { name: Schema.String },
    SendAsked: {},
    Started: { sessionId: Schema.String },
    StartRefused: { reason: Schema.String },
    Sent: { id: Schema.Finite },
    SendRefused: { id: Schema.Finite, reason: Schema.String },
    Answered: { id: Schema.Finite, answer: Schema.String },
    AskRefused: { id: Schema.Finite, reason: Schema.String },
    Restored: { draft: Schema.NullOr(SavedDraft) },
    Kept: { changes: Schema.Finite },
  }),
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

/** Whether there is a change to keep now: none while a send is on its way. */
const unkept = (model: Model) =>
  model.restored &&
  model.changes !== model.kept &&
  model.unsent.length === 0 &&
  !model.starting;

// 7. Keep: after the last change, or at once.
const SETTLE = 250;

/** Sets a mode's text, the cursor at its end, for the mode to take. */
const setText = (model: Model, mode: Mode, text: string): Model => {
  const written = DraftMode.writtenOf(text);
  const id = model.reset + 1;
  return {
    ...changed(model),
    written: { ...model.written, [mode]: written },
    resets: { ...model.resets, [mode]: { id, ...written } },
    reset: id,
  };
};

// 2. Write: a `/btw` at the start of a Message switches to a Side Question.
const write = (model: Model, props: Props, mode: Mode, written: Written) => {
  const retyped = model.written[mode].text !== written.text;
  const next = {
    ...changed(model),
    written: { ...model.written, [mode]: written },
    problem: retyped ? null : model.problem,
  };
  const question =
    retyped && mode === 'Message' && modesOf(props).includes('SideQuestion')
      ? btwQuestion(written.text)
      : null;
  return question === null
    ? next
    : setText(
        setText(
          { ...next, mode: 'SideQuestion', picking: null },
          'Message',
          '',
        ),
        'SideQuestion',
        question,
      );
};

// 4. Start
const start = (model: Model, props: Props) => {
  const text = model.written.Message.text.trim();
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

// 6. Ask
const askOf = (model: Model, sessionId: string) => {
  const question = model.written.SideQuestion.text.trim();
  if (question === '') return {};
  const id = model.asks + 1;
  return {
    model: {
      ...setText(model, 'SideQuestion', ''),
      problem: null,
      asked: { id, question, answer: null, problem: null },
      asks: id,
    },
    command: ask({ id, sessionId, question }),
  };
};

// 5. Send
const sendTo = (model: Model, sessionId: string) => {
  if (model.mode === 'SideQuestion') return askOf(model, sessionId);
  const text = model.written.Message.text.trim();
  if (text === '' && model.attachments.length === 0) return {};
  const id = model.sends + 1;
  const { chosen } = model;
  return {
    model: {
      ...setText(model, 'Message', ''),
      attachments: [],
      unsent: [
        ...model.unsent,
        {
          id,
          text,
          attachments: model.attachments,
          changes: model.changes + 1,
        },
      ],
      sends: id,
      problem: null,
    },
    command: send({
      id,
      sessionId,
      text,
      attachments: wire(model.attachments),
      ...(chosen.model === null ? {} : { model: chosen.model }),
      ...(Object.keys(chosen.settings).length === 0
        ? {}
        : { settings: chosen.settings }),
    }),
  };
};

export const DraftLive = Actor.build(Draft, {
  init: () => ({
    model: {
      restored: false,
      changes: 0,
      kept: 0,
      mode: 'Message',
      written: { Message: DraftMode.blank, SideQuestion: DraftMode.blank },
      resets: { Message: null, SideQuestion: null },
      reset: 0,
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
    },
  }),
  // 3. Pick
  provides: (self) =>
    Layer.mergeAll(
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
      TouchDraft.owner(self.send({ _tag: 'SendAsked' })),
    ),
  children: {
    // 2. Write: one Child per Draft Mode, each from its text as written.
    modes: {
      actor: DraftMode.actor,
      each: ({ model, props }) => (model.restored ? modesOf(props) : []),
      input: ({ model }, key) => {
        const mode = DraftMode.modeOf(key);
        return { ...model.written[mode], reset: model.resets[mode]?.id ?? 0 };
      },
      props: ({ model }, key) => {
        const mode = DraftMode.modeOf(key);
        return { mode, reset: model.resets[mode] };
      },
    },
    // On a device with no keyboard, the Draft is drawn as the Touch Draft.
    touch: { actor: TouchDraft.actor },
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
    // 7. Keep: read back once, before anything is drawn.
    restore: {
      while: ({ model }) => !model.restored,
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const draft = yield* (yield* SavedDrafts).read(placeOf(props));
          yield* self.send({ _tag: 'Restored', draft });
        }),
    },
    // 7. Keep: a quarter of a second after the last change.
    save: {
      each: ({ model }) => (unkept(model) ? [String(model.changes)] : []),
      run: (self) =>
        Effect.gen(function* () {
          yield* Effect.sleep(SETTLE);
          const { model, props } = yield* self.get;
          yield* keep(placeOf(props), savedOf(model));
          yield* self.send({ _tag: 'Kept', changes: model.changes });
        }),
    },
    // 7. Keep: at once as the page is hidden or left, and as the Draft goes.
    flush: {
      while: ({ model }) => model.restored,
      run: (self) => {
        const flush = Effect.flatMap(self.get, ({ model, props }) =>
          unkept(model)
            ? Effect.as(keep(placeOf(props), savedOf(model)), model.changes)
            : Effect.succeed(null),
        );
        return Effect.addFinalizer(() => flush).pipe(
          Effect.andThen(
            Stream.runForEach(leaving, () =>
              Effect.flatMap(flush, (changes) =>
                changes === null
                  ? Effect.void
                  : self.send({ _tag: 'Kept', changes }),
              ),
            ),
          ),
        );
      },
    },
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
    // 7. Keep
    Restored: ({ draft }, { model, props }) => ({
      model:
        draft === null
          ? { ...model, restored: true }
          : {
              ...model,
              ...restoredOf(draft, modesOf(props)),
              restored: true,
            },
    }),
    Kept: ({ changes }, { model }) => ({
      model: { ...model, kept: Math.max(model.kept, changes) },
    }),
    CatalogRetryAsked: () => ({ command: retryCatalog() }),
    // 2. Write
    Written: ({ mode, text, anchor, head }, { model, props }) => ({
      model: write(model, props, mode, { text, anchor, head }),
    }),
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
    // 4. Start, 5. Send, 6. Ask
    SendAsked: (_, { model, props }) =>
      props.to._tag === 'Session'
        ? sendTo(model, props.to.sessionId)
        : start(model, props),
    Started: ({ sessionId }, { model, props }) => ({
      model: {
        ...setText(model, 'Message', ''),
        attachments: [],
        starting: false,
      },
      command: Router.push(
        session(props.machineId, props.projectId, sessionId),
      ),
    }),
    StartRefused: ({ reason }, { model }) => ({
      model: { ...model, starting: false, problem: reason },
    }),
    // 7. Keep: sent, its Saved Draft is forgotten.
    Sent: ({ id }, { model, props }) => {
      const sent = model.unsent.find((each) => each.id === id);
      const unsent = model.unsent.filter((each) => each.id !== id);
      return {
        model: {
          ...model,
          unsent,
          kept: sent?.changes === model.changes ? model.changes : model.kept,
        },
        ...(unsent.length === 0 ? { command: forget(placeOf(props)) } : {}),
      };
    },
    SendRefused: ({ id, reason }, { model }) => {
      const refused = model.unsent.find((each) => each.id === id);
      const back =
        refused &&
        model.written.Message.text === '' &&
        model.attachments.length === 0
          ? refused
          : null;
      return {
        model: {
          ...(back === null ? model : setText(model, 'Message', back.text)),
          problem: reason,
          attachments: back?.attachments ?? model.attachments,
          unsent: model.unsent.filter((each) => each.id !== id),
        },
      };
    },
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
