import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClient } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { session } from '../../../routes/index.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import { Catalog, SharedCatalog } from '../capabilities/index.ts';
import { btwQuestion } from './btw.ts';
import { ask, retryCatalog, send, startSession } from './commands.ts';
import { Attached, Insert, wire } from './message.ts';
import { ModelPicker } from './model-picker/index.ts';
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
 * 2. Write    its text and files, and every Insert put in, numbered, for its
 *             editor to put in once at its cursor: a paste, a drop, a Skill.
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
 * 6. Ask      a Draft that starts with `/btw` is a question on the side:
 *             its answer shows over the Status Line, never in the
 *             transcript. A newer question replaces it.
 * 7. Touch    on a device with no keyboard it is drawn as the Touch Draft,
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
});

const Asked = Schema.Struct({
  id: Schema.Finite,
  question: Schema.String,
  /** null while it is being answered, or when it failed. */
  answer: Schema.NullOr(Schema.String),
  problem: Schema.NullOr(Schema.String),
});

const Model = Schema.Struct({
  text: Schema.String,
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
  requires: [CodeClient, SharedCatalog, Navigation],
  props: Props,
  model: Model,
  message: Schema.TaggedUnion({
    CatalogRead: { catalog: Catalog.Model },
    CatalogRetryAsked: {},
    Typed: { text: Schema.String },
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
    AnswerDismissed: {},
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

// 4. Start
const start = (model: Model, props: Props) => {
  const text = model.text.trim();
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

// 5. Send, 6. Ask
const sendTo = (model: Model, sessionId: string) => {
  const question = btwQuestion(model.text);
  if (question === '')
    return { model: { ...model, problem: 'Write a question after /btw' } };
  if (question !== null) {
    const id = model.asks + 1;
    return {
      model: {
        ...model,
        text: '',
        problem: null,
        asked: { id, question, answer: null, problem: null },
        asks: id,
      },
      command: ask({ id, sessionId, question }),
    };
  }
  const text = model.text.trim();
  if (text === '' && model.attachments.length === 0) return {};
  const id = model.sends + 1;
  const { chosen } = model;
  return {
    model: {
      ...model,
      text: '',
      attachments: [],
      unsent: [...model.unsent, { id, text, attachments: model.attachments }],
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
      text: '',
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
    // 2. Write
    Typed: ({ text }, { model }) => ({
      model: { ...model, text, problem: null },
    }),
    AttachmentsChanged: ({ attachments }, { model }) => ({
      model: { ...model, attachments, problem: null },
    }),
    InsertAsked: ({ what }, { model }) => ({
      model: { ...model, insert: Insert.next(model.insert, what) },
    }),
    // 3. Pick
    PickerOpened: ({ picking }, { model, props }) =>
      model.picking !== null
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
          ...model,
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
        ...model,
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
      model: { ...model, text: '', attachments: [], starting: false },
      command: Router.push(
        session(props.machineId, props.projectId, sessionId),
      ),
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
    SendRefused: ({ id, reason }, { model }) => {
      const refused = model.unsent.find((each) => each.id === id);
      const back =
        refused && model.text === '' && model.attachments.length === 0
          ? refused
          : null;
      return {
        model: {
          ...model,
          problem: reason,
          text: back?.text ?? model.text,
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
    AnswerDismissed: (_, { model }) => ({ model: { ...model, asked: null } }),
  },
});
