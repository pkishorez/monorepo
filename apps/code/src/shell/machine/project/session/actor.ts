import { Layer, Schema, Stream } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Page, Router } from '@kestack/kabuki/routing';
import {
  HarnessInfo,
  type Session as SessionRecord,
} from '@kestack/ai-toolkit/api';
import { Replicas } from '@kestack/std-toolkit/replica';
import { machineIn, session } from '../../../../places/index.ts';
import { Refused } from '../../../../refusal/index.ts';
import {
  CurrentMachine,
  lineage,
  Messages,
  SessionRow,
} from '../../../../replica/index.ts';
import { DeviceState } from '../../../device-state/index.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import * as Catalog from '../catalog/index.ts';
import { Attached, SkillPicker, wire, withSkill } from '../composer/index.ts';
import { ModelPicker } from '../model-picker/index.ts';
import { ask, cancel, forkSession, send } from './api.ts';
import { btwQuestion } from './btw.ts';

/*
 * A session: its row, its messages, and the composer.
 *
 * 1. Read     the row says whether it runs; its messages sync while the
 *             page is open, through the session's Window. A Worker follows
 *             the row and the rows of the sessions it was forked from: the
 *             agent and project it is in, and, for a fork, each session up
 *             the chain, whose messages sync too, one Window each, so the
 *             history it carries on from can be drawn before its own.
 *             Reading it marks it seen on this device, up to the end of
 *             its last turn, and so does each turn ending while it is open.
 * 2. Skills   the agent's, from the catalog the project shares, for the
 *             skills Picker; nothing waits for them. When they cannot be
 *             read the Picker says why, and opening it again tries again.
 * 3. Models   the agent's models and settings, from the catalog, for the
 *             model Picker, which opens at the model: the agent is kept. A
 *             model or setting picked here goes with every message after
 *             it; until then the session's own. One Picker is open at a
 *             time, each a fresh one.
 * 4. Send     the draft and its files go to the server, which starts a turn
 *             when the session is idle, and steers the running one
 *             otherwise. The draft clears at once; refused, it comes back,
 *             each send kept apart until the server has answered it.
 * 5. Ask      a draft that starts with `/btw` is a question on the side: its
 *             answer shows over the composer, never in the transcript, and
 *             the session goes on as it was. A newer question replaces it.
 * 6. Fork     a new session from this one's context up to a turn's end;
 *             the app moves to it.
 * 7. Stop     cancels the running turn.
 * 8. Open     which tool calls, thoughts and subagents are shown open.
 */

/** A draft sent, kept until the server answers, to come back if refused. */
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

const ForkedFrom = Schema.NullOr(
  Schema.Struct({ sessionId: Schema.String, turnId: Schema.String }),
);

/** What the page acts on of its session's row. */
const Row = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  harness: HarnessInfo.fields.name,
  /** The model and settings it runs with now. */
  model: Schema.String,
  settings: Schema.Record(Schema.String, Schema.String),
  forkedFrom: ForkedFrom,
  /** When its last turn ended; null until one has. */
  endedAt: Schema.NullOr(Schema.Finite),
});

/** A session it was forked from, as far as its history needs. */
const Ancestor = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  forkedFrom: ForkedFrom,
});

const Read = Schema.Struct({ row: Row, lineage: Schema.Array(Ancestor) });
const sameRead = Schema.toEquivalence(Read);

/** 1. Read: the row and the sessions up its chain, nearest first. */
const readOf = ([own, ...up]: ReadonlyArray<SessionRecord>) =>
  own === undefined
    ? null
    : {
        row: {
          id: own.id,
          projectId: own.projectId,
          harness: own.harness,
          model: own.model,
          settings: own.settings,
          forkedFrom: own.forkedFrom,
          endedAt: own.endedAt,
        },
        lineage: up.map(({ id, title, forkedFrom }) => ({
          id,
          title,
          forkedFrom,
        })),
      };

const Picking = Schema.TaggedUnion({
  Skills: { how: Picker.How, at: Schema.Finite, typed: Schema.Boolean },
  Model: { how: Picker.How, at: Schema.Literals(['model', 'settings']) },
});

const Chosen = Schema.Struct({
  model: Schema.NullOr(Schema.String),
  settings: Schema.Record(Schema.String, Schema.String),
});

/** What the model Picker is handed before the row is seen, which it never opens for. */
const NOBODY = { harness: '', model: null, settings: {} };

/** `/` entries that are not skills. */
const COMMANDS = [
  {
    name: 'btw',
    description: 'Ask about this session without interrupting it',
  },
];

const Model = Schema.Struct({
  draft: Schema.String,
  attachments: Schema.Array(Attached),
  /** Sent and not yet answered, oldest first: brought back if refused. */
  unsent: Schema.Array(Unsent),
  /** How many were sent: each send's id. */
  sends: Schema.Finite,
  stopping: Schema.Boolean,
  problem: Schema.NullOr(Schema.String),
  open: Schema.Array(Schema.String),
  row: Schema.NullOr(Row),
  /** The sessions it was forked from, nearest first: none for one not forked. */
  lineage: Schema.Array(Ancestor),
  catalog: Catalog.Model,
  /** The Picker open, if one is. */
  picking: Schema.NullOr(Picking),
  /** How many Pickers were opened, so each is a fresh one. */
  opened: Schema.Finite,
  /** Picked here, sent with each message; null keeps the session's. */
  model: Schema.NullOr(Schema.String),
  settings: Schema.Record(Schema.String, Schema.String),
  asked: Schema.NullOr(Asked),
  /** The last question's id: a late answer to a dismissed one is told apart. */
  asks: Schema.Finite,
  /** The turn a fork is being made after. */
  forking: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

export const Session = Page.define({
  path: '/s/:sessionId',
  params: { sessionId: Schema.String },
  metadata: { title: 'Session · code' },
  requires: [
    AiClient,
    Catalog.Shared,
    Replicas,
    DeviceState.Store,
    CurrentMachine,
  ],
  model: Model,
  message: Schema.TaggedUnion({
    Read: Read.fields,
    Catalog: { catalog: Catalog.Model },
    Open: { picking: Picking },
    Unpicked: {},
    Chose: { chosen: Chosen },
    ChoseSkill: { name: Schema.String },
    Typed: { text: Schema.String },
    Attach: { attachments: Schema.Array(Attached) },
    Send: {},
    Stop: {},
    Toggle: { id: Schema.String },
    Sent: { id: Schema.Finite },
    SendRefused: { id: Schema.Finite, reason: Schema.String },
    Stopped: {},
    Answered: { id: Schema.Finite, answer: Schema.String },
    AskRefused: { id: Schema.Finite, reason: Schema.String },
    Dismiss: {},
    Fork: { afterTurnId: Schema.String },
    Forked: { projectId: Schema.String, sessionId: Schema.String },
    Refused,
  }),
});

/** The agent, model and settings in effect, for the model Picker; null until the row is seen. */
export const current = (model: Model) =>
  model.row === null
    ? null
    : {
        harness: model.row.harness,
        model: model.model ?? model.row.model,
        settings: { ...model.row.settings, ...model.settings },
      };

/** The agent's Skills and the commands, as the skills Picker lists them. */
export const skillsOf = (model: Model) => {
  const read = Catalog.skillsOf(model.catalog, model.row?.harness ?? null);
  return {
    commands: COMMANDS,
    skills: read?.list ?? [],
    loading: read === undefined,
    problem: read?.problem ?? null,
  };
};

export const SessionLive = Page.build(Session, {
  init: () => ({
    model: {
      draft: '',
      attachments: [],
      unsent: [],
      sends: 0,
      stopping: false,
      problem: null,
      open: [],
      row: null,
      lineage: [],
      catalog: Catalog.empty,
      picking: null,
      opened: 0,
      model: null,
      settings: {},
      asked: null,
      asks: 0,
      forking: null,
    },
  }),
  // 1. Read
  children: {
    session: {
      actor: SessionRow,
      props: ({ props }) => ({ sessionId: props.params.sessionId }),
    },
    messages: {
      actor: Messages,
      props: ({ props }) => ({ sessionId: props.params.sessionId }),
    },
    earlier: {
      actor: Messages,
      each: ({ model }) => model.lineage.map(({ id }) => id),
      props: (_, sessionId) => ({ sessionId }),
    },
    // 2. Skills
    skills: {
      actor: SkillPicker.Live,
      while: ({ model }) => model.picking?._tag === 'Skills',
      key: ({ model }) => String(model.opened),
      input: ({ model }) => SkillPicker.opening(model.picking?.how ?? 'keys'),
      props: ({ model }) => skillsOf(model),
    },
    // 3. Models
    models: {
      actor: ModelPicker.Live,
      while: ({ model }) =>
        model.picking?._tag === 'Model' && current(model) !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) =>
        ModelPicker.opening({
          how: model.picking?.how ?? 'keys',
          at: model.picking?._tag === 'Model' ? model.picking.at : 'model',
          started: true,
          catalog: model.catalog,
          current: current(model) ?? NOBODY,
        }),
      props: ({ model }) => ({
        catalog: model.catalog,
        current: current(model) ?? NOBODY,
      }),
    },
  },
  provides: (self) =>
    Layer.mergeAll(
      SkillPicker.owner((name) =>
        self.send(
          name === null ? { _tag: 'Unpicked' } : { _tag: 'ChoseSkill', name },
        ),
      ),
      ModelPicker.owner((chosen) =>
        self.send(
          chosen === null
            ? { _tag: 'Unpicked' }
            : {
                _tag: 'Chose',
                chosen: { model: chosen.model, settings: chosen.settings },
              },
        ),
      ),
    ),
  workers: {
    // 1. Read
    row: {
      each: ({ props }) => [props.params.sessionId],
      run: (self, sessionId) =>
        lineage(sessionId).pipe(
          Stream.map(readOf),
          Stream.filter((read) => read !== null),
          Stream.changesWith(sameRead),
          Stream.runForEach((read) => self.send({ _tag: 'Read', ...read })),
        ),
    },
    // 2. Skills, 3. Models: the catalog, as the project shares it.
    catalog: {
      run: (self) =>
        Stream.runForEach(Catalog.follow, (catalog) =>
          self.send({ _tag: 'Catalog', catalog }),
        ),
    },
  },
  on: {
    Read: ({ row, lineage }, { model, props }) => ({
      model: { ...model, row, lineage },
      // Seen up to the end of its last turn: on opening, and as each ends.
      ...(model.row?.id === row.id && model.row.endedAt === row.endedAt
        ? {}
        : {
            command: DeviceState.markSeen({
              machineId: machineIn(props.route.params),
              sessionId: row.id,
              seen: row.endedAt ?? 0,
            }),
          }),
    }),
    Catalog: ({ catalog }, { model }) => ({ model: { ...model, catalog } }),
    Open: ({ picking }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: { ...model, picking, opened: model.opened + 1 },
            ...(picking._tag === 'Skills' && skillsOf(model).problem !== null
              ? { command: Catalog.retry() }
              : {}),
          },
    Unpicked: (_, { model }) => ({ model: { ...model, picking: null } }),
    ChoseSkill: ({ name }, { model }) =>
      model.picking?._tag !== 'Skills'
        ? {}
        : {
            model: {
              ...model,
              picking: null,
              draft: withSkill(model.draft, name, model.picking),
            },
          },
    Chose: ({ chosen }, { model }) => ({
      model: {
        ...model,
        picking: null,
        model: chosen.model ?? model.model,
        settings: { ...model.settings, ...chosen.settings },
      },
    }),
    Typed: ({ text }, { model }) => ({ model: { ...model, draft: text } }),
    Attach: ({ attachments }, { model }) => ({
      model: { ...model, attachments },
    }),
    Send: (_, { model, props }) => {
      // 5. Ask
      const question = btwQuestion(model.draft);
      if (question === '')
        return {
          model: { ...model, problem: 'Write a question after /btw' },
        };
      if (question !== null) {
        const id = model.asks + 1;
        return {
          model: {
            ...model,
            draft: '',
            problem: null,
            asked: { id, question, answer: null, problem: null },
            asks: id,
          },
          command: ask({ id, sessionId: props.params.sessionId, question }),
        };
      }
      // 4. Send
      const text = model.draft.trim();
      if (text === '' && model.attachments.length === 0) return {};
      const id = model.sends + 1;
      return {
        model: {
          ...model,
          draft: '',
          attachments: [],
          unsent: [
            ...model.unsent,
            { id, text, attachments: model.attachments },
          ],
          sends: id,
          problem: null,
        },
        command: send({
          id,
          sessionId: props.params.sessionId,
          text,
          attachments: wire(model.attachments),
          ...(model.model === null ? {} : { model: model.model }),
          ...(Object.keys(model.settings).length === 0
            ? {}
            : { settings: model.settings }),
        }),
      };
    },
    Sent: ({ id }, { model }) => ({
      model: {
        ...model,
        unsent: model.unsent.filter((each) => each.id !== id),
      },
    }),
    SendRefused: ({ id, reason }, { model }) => {
      const refused = model.unsent.find((each) => each.id === id);
      const back =
        refused && model.draft === '' && model.attachments.length === 0
          ? refused
          : null;
      return {
        model: {
          ...model,
          problem: reason,
          draft: back?.text ?? model.draft,
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
    Dismiss: (_, { model }) => ({ model: { ...model, asked: null } }),
    // 6. Fork
    Fork: ({ afterTurnId }, { model, props }) =>
      model.forking !== null
        ? {}
        : {
            model: { ...model, forking: afterTurnId, problem: null },
            command: forkSession({
              sessionId: props.params.sessionId,
              afterTurnId,
            }),
          },
    Forked: ({ projectId, sessionId }, { model, props }) => ({
      model: { ...model, forking: null },
      command: Router.push(
        session(machineIn(props.route.params), projectId, sessionId),
      ),
    }),
    // 7. Stop
    Stop: (_, { model, props }) =>
      model.stopping
        ? {}
        : {
            model: { ...model, stopping: true, problem: null },
            command: cancel({ sessionId: props.params.sessionId }),
          },
    Stopped: (_, { model }) => ({ model: { ...model, stopping: false } }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, problem: reason, stopping: false, forking: null },
    }),
    // 8. Open
    Toggle: ({ id }, { model }) => ({
      model: {
        ...model,
        open: model.open.includes(id)
          ? model.open.filter((each) => each !== id)
          : [...model.open, id],
      },
    }),
  },
});
