import { Effect, Layer, Schema, Stream } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { home, machineIn, session } from '../../../places/index.ts';
import { Refused } from '../../../refusal/index.ts';
import { ProjectRow } from '../../../replica/index.ts';
import * as Picker from '../../../ui/picker/index.ts';
import { removeProject, startSession } from './api.ts';
import * as Catalog from './catalog/index.ts';
import { Attached, SkillPicker, wire, withSkill } from './composer/index.ts';
import { ModelPicker } from './model-picker/index.ts';
import * as Session from './session/index.ts';

/*
 * A project: a new session in it, and the session open under it, if the
 * URL names one.
 *
 * 1. Catalog  the agents, their models and Skills, read once while the
 *             project is open, and shared with the pages under it
 *             (`catalog/`); until one is picked, the first agent that runs.
 * 2. Pick     the model Picker sets the agent, its model and settings, each
 *             its default until picked; a new agent starts from its own.
 *             The skills Picker puts a `/name` in the message. One is open
 *             at a time, each a fresh one; opening the skills Picker reads
 *             again Skills that could not be read.
 * 3. Start    the session starts already running the first message, and
 *             the app moves to it.
 * 4. Remove   asks first, then forgets the project; its folder is never
 *             touched.
 */

const Picking = Schema.TaggedUnion({
  Skills: { how: Picker.How, at: Schema.Finite, typed: Schema.Boolean },
  Model: { how: Picker.How, at: Schema.Literals(['model', 'settings']) },
});

const Chosen = Schema.Struct({
  harness: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  settings: Schema.Record(Schema.String, Schema.String),
});

const Model = Schema.Struct({
  catalog: Catalog.Model,
  /** The agent picked; null: the first that runs. */
  harness: Schema.NullOr(Schema.String),
  /** null: the agent's default. */
  model: Schema.NullOr(Schema.String),
  /** The settings picked; any other is its default. */
  settings: Schema.Record(Schema.String, Schema.String),
  text: Schema.String,
  attachments: Schema.Array(Attached),
  /** The Picker open, if one is. */
  picking: Schema.NullOr(Picking),
  /** How many Pickers were opened, so each is a fresh one. */
  opened: Schema.Finite,
  starting: Schema.Boolean,
  problem: Schema.NullOr(Schema.String),
  removal: Schema.Struct({
    confirming: Schema.Boolean,
    removing: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  }),
});
type Model = typeof Model.Type;

export const Project = Page.define({
  path: '/p/:projectId',
  params: { projectId: Schema.String },
  metadata: { title: 'Project · code' },
  requires: [AiClient, Navigation],
  pages: { Session: Session.Page },
  model: Model,
  message: Schema.TaggedUnion({
    Catalog: { change: Catalog.Change },
    Retry: {},
    Open: { picking: Picking },
    Unpicked: {},
    Chose: { chosen: Chosen },
    ChoseSkill: { name: Schema.String },
    Typed: { text: Schema.String },
    Attach: { attachments: Schema.Array(Attached) },
    Start: {},
    Started: { sessionId: Schema.String },
    Refused,
    Confirm: { open: Schema.Boolean },
    Remove: {},
    Removed: {},
    RemoveRefused: Refused,
  }),
});

/** The agent picked, as the server describes it: the first that runs until one is. */
export const pickedHarness = (model: Model) =>
  Catalog.harnessOf(model.catalog, model.harness) ??
  model.catalog.harnesses?.find(({ available }) => available) ??
  model.catalog.harnesses?.[0] ??
  null;

/** The model to start with: the one picked, or the agent's default. */
export const pickedModel = (model: Model) =>
  model.model ?? pickedHarness(model)?.defaultModel ?? null;

/** Every setting's value: the one picked, or its default. */
export const pickedSettings = (model: Model): Record<string, string> =>
  Object.fromEntries(
    (pickedHarness(model)?.settings ?? []).map(({ key, default: value }) => [
      key,
      model.settings[key] ?? value,
    ]),
  );

/** The agent, model and settings in effect, for the model Picker; null until the agents are known. */
export const current = (model: Model) => {
  const harness = pickedHarness(model);
  return harness === null
    ? null
    : { harness: harness.name, model: model.model, settings: model.settings };
};

/** The picked agent's Skills, as the skills Picker lists them. */
export const skillsOf = (model: Model) => {
  const harness = pickedHarness(model);
  const read = Catalog.skillsOf(model.catalog, harness?.name ?? null);
  return {
    commands: [],
    skills: read?.list ?? [],
    loading:
      read === undefined &&
      (model.catalog.harnesses === null
        ? model.catalog.problem === null
        : harness?.available === true),
    problem: read?.problem ?? null,
  };
};

const retried = (model: Model) => ({
  ...model,
  catalog: Catalog.changed(model.catalog, { _tag: 'Retry' }),
});

export const ProjectLive = Page.build(Project, {
  init: () => ({
    model: {
      catalog: Catalog.empty,
      harness: null,
      model: null,
      settings: {},
      text: '',
      attachments: [],
      picking: null,
      opened: 0,
      starting: false,
      problem: null,
      removal: { confirming: false, removing: false, problem: null },
    },
  }),
  pages: { Session: Session.Live },
  provides: (self) =>
    Layer.mergeAll(
      // 1. Catalog, for the pages under it.
      Catalog.share(
        self.changes.pipe(Stream.map(({ model }) => model.catalog)),
        self.send({ _tag: 'Retry' }),
      ),
      // 2. Pick
      SkillPicker.owner((name) =>
        self.send(
          name === null ? { _tag: 'Unpicked' } : { _tag: 'ChoseSkill', name },
        ),
      ),
      ModelPicker.owner((chosen) =>
        self.send(
          chosen === null ? { _tag: 'Unpicked' } : { _tag: 'Chose', chosen },
        ),
      ),
    ),
  workers: {
    // 1. Catalog
    harnesses: {
      while: ({ model }) => Catalog.wants.harnesses(model.catalog),
      run: (self) =>
        Effect.flatMap(Catalog.read.harnesses, (change) =>
          self.send({ _tag: 'Catalog', change }),
        ),
    },
    models: {
      each: ({ model }) => Catalog.wants.models(model.catalog),
      run: (self, harness) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const change = yield* Catalog.read.models(model.catalog, harness);
          yield* self.send({ _tag: 'Catalog', change });
        }),
    },
    skills: {
      each: ({ model }) => Catalog.wants.skills(model.catalog),
      run: (self, harness) =>
        Effect.gen(function* () {
          const { model, props } = yield* self.get;
          const change = yield* Catalog.read.skills(
            model.catalog,
            props.params.projectId,
            harness,
          );
          yield* self.send({ _tag: 'Catalog', change });
        }),
    },
  },
  children: {
    project: {
      actor: ProjectRow,
      props: ({ props }) => ({ projectId: props.params.projectId }),
    },
    // 2. Pick
    skills: {
      actor: SkillPicker.Live,
      while: ({ model }) => model.picking?._tag === 'Skills',
      key: ({ model }) => String(model.opened),
      input: ({ model }) => SkillPicker.opening(model.picking?.how ?? 'keys'),
      props: ({ model }) => skillsOf(model),
    },
    models: {
      actor: ModelPicker.Live,
      while: ({ model }) =>
        model.picking?._tag === 'Model' && current(model) !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) =>
        ModelPicker.opening({
          how: model.picking?.how ?? 'keys',
          at: model.picking?._tag === 'Model' ? model.picking.at : 'model',
          started: false,
          catalog: model.catalog,
          current: current(model) ?? { harness: '', model: null, settings: {} },
        }),
      props: ({ model }) => ({
        catalog: model.catalog,
        current: current(model) ?? { harness: '', model: null, settings: {} },
      }),
    },
  },
  on: {
    Catalog: ({ change }, { model }) => ({
      model: { ...model, catalog: Catalog.changed(model.catalog, change) },
    }),
    Retry: (_, { model }) => ({ model: retried(model) }),
    // 2. Pick
    Open: ({ picking }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: {
              ...(picking._tag === 'Skills' && skillsOf(model).problem !== null
                ? retried(model)
                : model),
              picking,
              opened: model.opened + 1,
            },
          },
    Unpicked: (_, { model }) => ({ model: { ...model, picking: null } }),
    ChoseSkill: ({ name }, { model }) =>
      model.picking?._tag !== 'Skills'
        ? {}
        : {
            model: {
              ...model,
              picking: null,
              text: withSkill(model.text, name, model.picking),
            },
          },
    Chose: ({ chosen }, { model }) => {
      const harness = Catalog.harnessOf(model.catalog, chosen.harness);
      const fresh =
        harness !== null && harness.name !== pickedHarness(model)?.name;
      return {
        model: {
          ...model,
          picking: null,
          harness: harness?.name ?? model.harness,
          model: chosen.model ?? (fresh ? null : model.model),
          settings: { ...(fresh ? {} : model.settings), ...chosen.settings },
          problem: null,
        },
      };
    },
    Typed: ({ text }, { model }) => ({
      model: { ...model, text, problem: null },
    }),
    Attach: ({ attachments }, { model }) => ({
      model: { ...model, attachments, problem: null },
    }),
    // 3. Start
    Start: (_, { model, props }) => {
      const text = model.text.trim();
      const harness = pickedHarness(model);
      const picked = pickedModel(model);
      if (model.starting || harness === null || picked === null) return {};
      if (!harness.available)
        return {
          model: {
            ...model,
            problem:
              harness.unavailableReason ??
              'This agent cannot run on this machine',
          },
        };
      if (text === '' && model.attachments.length === 0)
        return { model: { ...model, problem: 'Write the first message' } };
      return {
        model: { ...model, starting: true, problem: null },
        command: startSession({
          projectId: props.params.projectId,
          harness: harness.name,
          model: picked,
          settings: pickedSettings(model),
          text,
          attachments: wire(model.attachments),
        }),
      };
    },
    Started: ({ sessionId }, { model, props }) => ({
      model: { ...model, text: '', attachments: [], starting: false },
      command: Router.push(
        session(
          machineIn(props.route.params),
          props.params.projectId,
          sessionId,
        ),
      ),
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, starting: false, problem: reason },
    }),
    // 4. Remove
    Confirm: ({ open }, { model }) =>
      model.removal.removing
        ? {}
        : {
            model: {
              ...model,
              removal: { confirming: open, removing: false, problem: null },
            },
          },
    Remove: (_, { model, props }) =>
      model.removal.removing
        ? {}
        : {
            model: {
              ...model,
              removal: { ...model.removal, removing: true },
            },
            command: removeProject({ id: props.params.projectId }),
          },
    Removed: (_, { model, props }) => ({
      model: {
        ...model,
        removal: { confirming: false, removing: false, problem: null },
      },
      command: Router.push(home(machineIn(props.route.params))),
    }),
    RemoveRefused: ({ reason }, { model }) => ({
      model: {
        ...model,
        removal: { ...model.removal, removing: false, problem: reason },
      },
    }),
  },
});
