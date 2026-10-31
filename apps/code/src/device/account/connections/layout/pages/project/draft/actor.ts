import { Cause, Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Branches, CodeClient, link, START_STEPS } from '@kestack/connect/code';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { session } from '../../../../../../routes/index.ts';
import * as Picker from '../../../../../../../ui/controls/picker/index.ts';
import {
  SavedDraft,
  SavedDrafts,
  Written,
} from '../../../../connection/store/index.ts';
import * as Catalog from '../store.ts';
import { Handover, SessionArrival, SharedCatalog } from '../store.ts';
import {
  retryCatalog,
  StartArgs,
  starting as startingOf,
} from './send/commands.ts';
import { Attached, Insert } from './draft.ts';
import { DraftMode, type Mode } from './write/view.tsx';
import { ModelPicker } from './pick/model/index.ts';
import { current, NOBODY, pickedHarness, skillsOf } from './pick/pick.ts';
import { read, restoredOf, saving, Where, whereOf } from './store.ts';
import { askOf, sendTo, start } from './send/send.ts';
import { SkillPicker } from './pick/skills.ts';
import { BranchPicker } from './pick/branch/index.ts';

/*
 * The Draft: the next message of a page, a new session's first or an open
 * Session's next, with what goes with it. It is its own Actor, so typing
 * into it, picking for it or dictating into it draws only it.
 *
 * 1. Write  in its Draft Mode, a Child each (`write/`): a Message, or, in
 *           a Session, a Side Question, each the one owner of its text,
 *           cursor and selection. The Draft keeps the mode open, switched
 *           by its Side Question toggle or its keys, the Message's files
 *           and every Insert, numbered, for the editor of the mode open to
 *           put in once at its cursor: a paste, a drop, a Dictation, a
 *           Skill.
 * 2. Pick   the model Picker sets the agent, its model and settings, each
 *           its default until picked (`pick/`), from the agents, models
 *           and Skills the project shares, which nothing waits for; a new
 *           agent starts from its own, and a Session keeps its agent. On
 *           touch the model chip sets a setting in place. The skills
 *           Picker puts a `/name` in, as one atom. A new session's Branch
 *           Picker sets its branch, from the Project's branches, read as
 *           it opens and again as the Picker opens, and the New Worktree
 *           toggle beside it; neither shows for a Project that is not a
 *           git repository. Branches that could not be read, the link
 *           down, are read again once it is back, and until they are its
 *           picks stand as they were saved. One Picker is open at a time,
 *           each a fresh one.
 * 3. Send   a mode hands its text up (`send/`). A new session's Draft
 *           starts the session, already running its first message, under
 *           an id it chose, its Starting run by a Worker: each StartStep
 *           shown as it comes, then the app moves to it once it is there,
 *           as the Connection answers or, the answer lost, as it shows
 *           among the Connection's sessions; the project page keeps the
 *           Draft drawn until the Session's page is ready (`Handover`).
 *           Refused, a git step failed, or never there, it stays, its
 *           text and picks as they were, and says why. A
 *           Session's Message goes to the server, which starts a turn or
 *           steers the running one; refused, its files and its text come
 *           back. Sent while the Side Question toggle is on, it is a Side
 *           Question, asked on the side, answered by the Session's own
 *           agent, a new one replacing the last.
 * 4. Keep   the Draft is saved on this device as it shows, its Saved Draft
 *           (`store.ts`), under the Account it opened with: read back
 *           before it is drawn, saved after each change and as the page is
 *           left, and deleted once a new session it started has started.
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
  connectionId: Schema.String,
  projectId: Schema.String,
  to: To,
});
export type Props = typeof Props.Type;

const Picking = Schema.TaggedUnion({
  /** `typed`: opened by a `/` typed in the Composer, which the skill takes the place of. */
  Skills: { how: Picker.How, typed: Schema.Boolean },
  Model: { how: Picker.How, at: ModelPicker.At },
  Branch: { how: Picker.How },
});

/** A StartStep as it stands. */
const Step = Schema.Struct({
  step: Schema.Literals(START_STEPS),
  state: Schema.Literals(['running', 'done']),
});

/**
 * A new session being started: its id, null until chosen, what it is
 * started with, and its steps so far: until Connect tells any (`told`),
 * the one it is expected to run first, running.
 */
export const Starting = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  args: StartArgs,
  steps: Schema.Array(Step),
  told: Schema.Boolean,
});

/** What the model Picker set; null: as it was. */
const Chosen = Schema.Struct({
  /** The Harness Account picked. */
  account: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  settings: Schema.Record(Schema.String, Schema.String),
});

/** The Side Question asked, and how it stands. */
export const Asked = Schema.Struct({
  id: Schema.Finite,
  question: Schema.String,
  /** null while it is being answered, or when it failed. */
  answer: Schema.NullOr(Schema.String),
  problem: Schema.NullOr(Schema.String),
});

/** Text given back to a mode: a refused send's. */
const Given = Schema.Struct({
  mode: DraftMode.Mode,
  ...DraftMode.Given.fields,
});

const Model = Schema.Struct({
  /** Its Saved Draft has been read back. */
  restored: Schema.Boolean,
  /** The Account and place it is saved under, fixed once read back; null with nobody signed in. */
  where: Schema.NullOr(Where),
  /** Its new session has started: it is saved no more. */
  started: Schema.Boolean,
  /** The Draft Mode open. */
  mode: DraftMode.Mode,
  /** What each mode starts from, as read back; the mode owns it after. */
  opening: Schema.Struct({ Message: Written, SideQuestion: Written }),
  /** On touch, it is open: kept, and how it opens again. */
  open: Schema.Boolean,
  given: Schema.NullOr(Given),
  attachments: Schema.Array(Attached),
  /** The last thing put in, for its editor to put in at its cursor. */
  insert: Schema.NullOr(Insert.Schema),
  catalog: Catalog.Catalog,
  /** Picked here; any left null is the agent's own, or its default. */
  chosen: Chosen,
  /** A new session's branch picked; null: the one the Project's folder is on. */
  branch: Schema.NullOr(Schema.String),
  /** A new session runs in a new Worktree, on a new branch from `branch`. */
  newWorktree: Schema.Boolean,
  /** A new session's Project's branches; null while they are read. */
  branches: Schema.NullOr(Branches.schema),
  /** How many times the branches were asked for, each read once. */
  listed: Schema.Finite,
  /** The last ask for the branches failed: they are asked again once the link is back. */
  unlisted: Schema.Boolean,
  /** How many times its link came up, so a failure from before the last is told apart. */
  linked: Schema.Finite,
  /** The Picker open, if one is. */
  picking: Schema.NullOr(Picking),
  /** How many Pickers were opened, so each is a fresh one. */
  opened: Schema.Finite,
  /** Why the last start or send went wrong, until the next, or an edit. */
  problem: Schema.NullOr(Schema.String),
  /** A new session being started, or started; null while none is. */
  starting: Schema.NullOr(Starting),
  asked: Schema.NullOr(Asked),
  /** The last question's id: a late answer to a dismissed one is told apart. */
  asks: Schema.Finite,
});
export type Model = typeof Model.Type;

const Message = Schema.TaggedUnion({
  CatalogRead: { catalog: Catalog.Catalog },
  CatalogRetryAsked: {},
  ModeAsked: { mode: DraftMode.Mode },
  AttachmentsChanged: { attachments: Schema.Array(Attached) },
  InsertAsked: { what: Insert.What },
  /** A mode's text was edited since the last problem. */
  Retyped: {},
  PickerOpened: { picking: Picking },
  PickerClosed: {},
  ModelChosen: { chosen: Chosen },
  SettingChosen: { key: Schema.String, value: Schema.String },
  SkillChosen: { name: Schema.String },
  BranchesRead: { branches: Branches.schema },
  /** The branches could not be read, asked while the link had come up `linked` times. */
  BranchesFailed: { linked: Schema.Finite },
  /** Its link came up. */
  Linked: {},
  BranchChosen: { branch: Schema.String },
  NewWorktreeToggled: {},
  /** A mode handed up its text: to send, start with or ask. */
  SendAsked: { mode: DraftMode.Mode, text: Schema.String },
  StartNamed: { id: Schema.String },
  Stepped: Step.fields,
  Started: { sessionId: Schema.String },
  StartRefused: { reason: Schema.String },
  SendRefused: {
    text: Schema.String,
    attachments: Schema.Array(Attached),
    reason: Schema.String,
  },
  Answered: { id: Schema.Finite, answer: Schema.String },
  AskRefused: { id: Schema.Finite, reason: Schema.String },
  Restored: { where: Schema.NullOr(Where), draft: Schema.NullOr(SavedDraft) },
  /** On touch, a mode's Touch Draft was opened or collapsed. */
  Opened: { mode: DraftMode.Mode, open: Schema.Boolean },
});

const Draft = Actor.define('Draft', {
  requires: [
    CodeClient,
    SharedCatalog,
    SessionArrival,
    Handover,
    Navigation,
    SavedDrafts,
    Accounts,
    RpcConnection,
  ],
  props: Props,
  model: Model,
  message: Message,
});

/** The modes this Draft has. */
export const modesOf = ({ to }: Props) =>
  DraftMode.modesOf(to._tag === 'Session');

/** Text given back to a mode, the next after the last. */
const give = (model: Model, mode: Mode, text: string, replaces: boolean) => ({
  mode,
  id: (model.given?.id ?? 0) + 1,
  text,
  replaces,
});

export const DraftLive = Draft.build({
  init: () => ({
    model: {
      restored: false,
      where: null,
      started: false,
      mode: 'Message',
      opening: { Message: DraftMode.blank, SideQuestion: DraftMode.blank },
      open: false,
      given: null,
      attachments: [],
      insert: null,
      catalog: Catalog.empty,
      chosen: { account: null, model: null, settings: {} },
      branch: null,
      newWorktree: false,
      branches: null,
      listed: 0,
      unlisted: false,
      linked: 0,
      picking: null,
      opened: 0,
      problem: null,
      starting: null,
      asked: null,
      asks: 0,
    },
  }),
  provides: (self) =>
    Layer.mergeAll(
      // 2. Pick
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
      BranchPicker.owner((branch) =>
        self.send(
          branch === null
            ? { _tag: 'PickerClosed' }
            : { _tag: 'BranchChosen', branch },
        ),
      ),
      // 1. Write, 3. Send, 4. Keep: what each mode shows and hands up.
      DraftMode.owner(
        Effect.gen(function* () {
          const texts = yield* SubscriptionRef.make<
            Partial<Record<Mode, Written>>
          >({});
          yield* Effect.forkScoped(saving(self, modesOf, texts));
          return {
            shows: (mode: Mode, written: Stream.Stream<Written>) =>
              Stream.runForEach(written, (each) =>
                SubscriptionRef.update(texts, (all) => ({
                  ...all,
                  [mode]: each,
                })),
              ),
            send: (mode: Mode, text: string) =>
              self.send({ _tag: 'SendAsked', mode, text }),
            opened: (mode: Mode, open: boolean) =>
              self.send({ _tag: 'Opened', mode, open }),
          };
        }),
      ),
    ),
  children: {
    // 1. Write: one Child per Draft Mode, once its Saved Draft is read back.
    modes: Actor.child(DraftMode.actor, {
      each: ({ model, props }) => (model.restored ? modesOf(props) : []),
      input: ({ model }, key) => ({
        written: model.opening[key as Mode],
        open: model.open,
      }),
      props: ({ model, props }, key) => {
        const mode = key as Mode;
        const session = props.to._tag === 'Session';
        const { given } = model;
        return {
          mode,
          clears: session,
          given:
            given?.mode === mode
              ? { id: given.id, text: given.text, replaces: given.replaces }
              : null,
        };
      },
    }),
    // 2. Pick
    skills: Actor.child(SkillPicker.Live, {
      while: ({ model }) => model.picking?._tag === 'Skills',
      key: ({ model }) => String(model.opened),
      input: ({ model }) => SkillPicker.opening(model.picking?.how ?? 'keys'),
      props: ({ model, props }) => skillsOf(model, props),
    }),
    models: Actor.child(ModelPicker.Live, {
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
    }),
    branches: Actor.child(BranchPicker.Live, {
      while: ({ model }) =>
        model.picking?._tag === 'Branch' && model.branches?._tag === 'Git',
      key: ({ model }) => String(model.opened),
      input: ({ model }) => BranchPicker.opening(model.picking?.how ?? 'keys'),
      props: ({ model }) => ({
        branches: model.branches ?? { _tag: 'NotGit' as const },
        picked: model.branch,
      }),
    }),
  },
  workers: {
    // 4. Keep: read back once, under the Account signed in as it opens.
    restore: {
      while: ({ model }) => !model.restored,
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const where = yield* whereOf({
            connectionId: props.connectionId,
            projectId: props.projectId,
            sessionId: props.to._tag === 'Session' ? props.to.sessionId : null,
          });
          const draft = where === null ? null : yield* read(where);
          yield* self.send({ _tag: 'Restored', where, draft });
        }),
    },
    // 2. Pick: a new session's branches, as git has them; a Project the
    // Connection no longer has is taken as not a git repository. Not read
    // at all, the link down, they are not known: asked again once it is
    // back.
    branches: {
      each: ({ model, props }) =>
        props.to._tag === 'NewSession' ? [String(model.listed)] : [],
      run: (self) =>
        Effect.gen(function* () {
          const { model, props } = yield* self.get;
          const { linked } = model;
          yield* CodeClient.use((api) =>
            api.branches({ projectId: props.projectId }),
          ).pipe(
            Effect.catchTag('ProjectNotFound', () =>
              Effect.succeed({ _tag: 'NotGit' as const }),
            ),
            Effect.matchCauseEffect({
              onSuccess: (branches) =>
                self.send({ _tag: 'BranchesRead', branches }),
              onFailure: (cause) =>
                Cause.hasInterruptsOnly(cause)
                  ? Effect.interrupt
                  : self.send({ _tag: 'BranchesFailed', linked }),
            }),
          );
        }),
    },
    // 2. Pick: each time a new session's link comes up again, after how
    // it stood as the Draft opened.
    link: {
      while: ({ props }) => props.to._tag === 'NewSession',
      run: (self) =>
        link.pipe(
          Stream.changes,
          Stream.drop(1),
          Stream.filter((now) => now === 'linked'),
          Stream.runForEach(() => self.send({ _tag: 'Linked' })),
        ),
    },
    // 3. Send: a new session's Starting, once its id is chosen.
    start: {
      each: ({ model }) =>
        model.starting === null || model.starting.id === null || model.started
          ? []
          : [model.starting.id],
      run: (self, id) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          if (model.starting === null) return;
          yield* startingOf(id, model.starting.args, self.send);
        }),
    },
    // 2. Pick: the catalog, as the project shares it.
    catalog: {
      run: (self) =>
        Stream.runForEach(
          Stream.unwrap(Effect.map(SharedCatalog, ({ changes }) => changes)),
          (catalog) => self.send({ _tag: 'CatalogRead', catalog }),
        ),
    },
  },
  on: {
    // 1. Write
    CatalogRead: ({ catalog }, { model }) => ({ model: { ...model, catalog } }),
    CatalogRetryAsked: () => ({ command: retryCatalog() }),
    ModeAsked: ({ mode }, { model, props }) =>
      !modesOf(props).includes(mode) || model.mode === mode
        ? {}
        : { model: { ...model, mode, picking: null, problem: null } },
    AttachmentsChanged: ({ attachments }, { model }) => ({
      model: { ...model, attachments, problem: null },
    }),
    InsertAsked: ({ what }, { model }) => ({
      model: { ...model, insert: Insert.next(model.insert, what) },
    }),
    Retyped: (_, { model }) => ({ model: { ...model, problem: null } }),
    // 2. Pick
    PickerOpened: ({ picking }, { model, props }) =>
      model.picking !== null ||
      !DraftMode.takes(model.mode)[
        picking._tag === 'Skills' ? 'skills' : 'picks'
      ]
        ? {}
        : {
            model: {
              ...model,
              picking,
              opened: model.opened + 1,
              // Its branches are read again, as Origin's may have come.
              listed: model.listed + (picking._tag === 'Branch' ? 1 : 0),
            },
            ...(picking._tag === 'Skills' &&
            skillsOf(model, props).problem !== null
              ? { command: retryCatalog() }
              : {}),
          },
    PickerClosed: (_, { model }) => ({ model: { ...model, picking: null } }),
    BranchesRead: ({ branches }, { model }) => ({
      model: { ...model, branches, unlisted: false },
    }),
    // Its link came up again since they were asked: asked again now.
    BranchesFailed: ({ linked }, { model }) => ({
      model:
        model.linked === linked
          ? { ...model, unlisted: true }
          : { ...model, listed: model.listed + 1 },
    }),
    Linked: (_, { model }) => ({
      model: {
        ...model,
        linked: model.linked + 1,
        unlisted: false,
        listed: model.listed + (model.unlisted ? 1 : 0),
      },
    }),
    BranchChosen: ({ branch }, { model }) =>
      model.picking?._tag !== 'Branch'
        ? {}
        : { model: { ...model, picking: null, problem: null, branch } },
    NewWorktreeToggled: (_, { model }) =>
      model.starting !== null
        ? {}
        : {
            model: { ...model, problem: null, newWorktree: !model.newWorktree },
          },
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
    // 3. Send
    SendAsked: ({ mode, text }, { model, props }) =>
      props.to._tag === 'NewSession'
        ? start(model, props, text)
        : mode === 'SideQuestion'
          ? askOf(model, props.to.sessionId, text)
          : sendTo(model, props.to.sessionId, text),
    StartNamed: ({ id }, { model }) =>
      model.starting === null || model.starting.id !== null
        ? {}
        : { model: { ...model, starting: { ...model.starting, id } } },
    // Each step where it first came, as it stands now; the one expected
    // first gives way to the first Connect tells.
    Stepped: ({ step, state }, { model }) => {
      if (model.starting === null) return {};
      const steps = model.starting.told ? model.starting.steps : [];
      return {
        model: {
          ...model,
          starting: {
            ...model.starting,
            told: true,
            steps: steps.some((each) => each.step === step)
              ? steps.map((each) =>
                  each.step === step ? { step, state } : each,
                )
              : [...steps, { step, state }],
          },
        },
      };
    },
    // 4. Keep: started, it is saved no more, and its Saved Draft goes.
    Started: ({ sessionId }, { model, props }) => ({
      model: { ...model, started: true, attachments: [] },
      command: Router.push(
        session(props.connectionId, props.projectId, sessionId),
      ),
    }),
    StartRefused: ({ reason }, { model }) => ({
      model: { ...model, starting: null, problem: reason },
    }),
    SendRefused: ({ text, attachments, reason }, { model }) => ({
      model: {
        ...model,
        problem: reason,
        attachments: [...attachments, ...model.attachments],
        ...(text === '' ? {} : { given: give(model, 'Message', text, false) }),
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
    // 4. Keep
    // Only the mode on screen says: another's is out of sight.
    Opened: ({ mode, open }, { model }) =>
      mode === model.mode ? { model: { ...model, open } } : {},
    Restored: ({ where, draft }, { model, props }) => ({
      model: {
        ...model,
        ...(draft === null ? {} : restoredOf(draft, modesOf(props))),
        where,
        restored: true,
      },
    }),
  },
});
