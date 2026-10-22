import { Effect, Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import {
  Attached,
  HarnessInfo,
  loadHarnesses,
  loadModels,
  loadSkills,
  ModelInfo,
  Refused,
  SkillSchema,
  startSession,
  wire,
} from '../../ai/index.ts';
import { session } from '../../places/index.ts';

/*
 * Starting a session in a project: which agent, which model, the agent's
 * own settings, and the first message with its files.
 *
 * 1. Agents   read once from the server; the first that runs is picked.
 * 2. Models   read per agent the first time it is picked, newest first;
 *             until one is picked, the agent's default.
 * 3. Skills   read for every agent that runs as soon as the agents are
 *             known, so the `/` palette has them whichever is picked.
 *             Nothing waits for them. When they cannot be read the palette
 *             says why, and opening it again tries again.
 * 4. Settings each the agent's default until one is picked.
 * 5. Start    the session starts already running the first message, and
 *             the app moves to it.
 */

const Name = HarnessInfo.fields.name;
type Name = typeof Name.Type;

const Models = Schema.Struct({
  harness: Name,
  status: Schema.Literals(['ready', 'failed']),
  list: Schema.Array(ModelInfo),
  problem: Schema.NullOr(Schema.String),
});

const Skills = Schema.Struct({
  harness: Name,
  list: Schema.Array(SkillSchema),
  /** Why they could not be read; null when they were. */
  problem: Schema.NullOr(Schema.String),
});

const Model = Schema.Struct({
  harnesses: Schema.NullOr(Schema.Array(HarnessInfo)),
  harnessProblem: Schema.NullOr(Schema.String),
  harness: Schema.NullOr(Name),
  models: Schema.Array(Models),
  /** null: the agent's default. */
  model: Schema.NullOr(Schema.String),
  /** The settings picked; any other is its default. */
  settings: Schema.Record(Schema.String, Schema.String),
  skills: Schema.Array(Skills),
  text: Schema.String,
  attachments: Schema.Array(Attached),
  starting: Schema.Boolean,
  problem: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

export const NewSession = Actor.define('NewSession', {
  requires: [AiClient, Navigation],
  props: Schema.Struct({ projectId: Schema.String }),
  model: Model,
  message: Schema.TaggedUnion({
    HarnessesLoaded: { harnesses: Schema.Array(HarnessInfo) },
    HarnessesFailed: { reason: Schema.String },
    ModelsLoaded: { harness: Name, models: Schema.Array(ModelInfo) },
    ModelsFailed: { harness: Name, reason: Schema.String },
    SkillsLoaded: { harness: Name, skills: Schema.Array(SkillSchema) },
    SkillsFailed: { harness: Name, reason: Schema.String },
    RetrySkills: {},
    Retry: {},
    PickHarness: { harness: Name },
    PickModel: { model: Schema.String },
    PickSetting: { key: Schema.String, value: Schema.String },
    Typed: { text: Schema.String },
    Attach: { attachments: Schema.Array(Attached) },
    Start: {},
    Started: { sessionId: Schema.String },
    Refused,
  }),
});

/** The agent picked, as the server describes it. */
export const pickedHarness = (model: Model) =>
  model.harnesses?.find(({ name }) => name === model.harness) ?? null;

/** The model to start with: the one picked, or the agent's default. */
export const pickedModel = (model: Model) =>
  model.model ?? pickedHarness(model)?.defaultModel ?? null;

/** The Skills the picked agent offers here; none until they arrive. */
export const pickedSkills = (model: Model) =>
  model.skills.find(({ harness }) => harness === model.harness)?.list ?? [];

/** Why the picked agent's Skills could not be read; null when they were or still may be. */
export const skillsProblem = (model: Model) =>
  model.skills.find(({ harness }) => harness === model.harness)?.problem ??
  null;

/** Whether the picked agent's Skills are still being read. */
export const skillsLoading = (model: Model) =>
  model.harnesses === null
    ? model.harnessProblem === null
    : pickedHarness(model)?.available === true &&
      !model.skills.some(({ harness }) => harness === model.harness);

/** Every setting's value: the one picked, or its default. */
export const pickedSettings = (model: Model): Record<string, string> =>
  Object.fromEntries(
    (pickedHarness(model)?.settings ?? []).map(({ key, default: value }) => [
      key,
      model.settings[key] ?? value,
    ]),
  );

export const NewSessionLive = Actor.build(NewSession, {
  init: () => ({
    model: {
      harnesses: null,
      harnessProblem: null,
      harness: null,
      models: [],
      model: null,
      settings: {},
      skills: [],
      text: '',
      attachments: [],
      starting: false,
      problem: null,
    },
  }),
  workers: {
    // 1. Agents
    harnesses: {
      while: ({ model }) =>
        model.harnesses === null && model.harnessProblem === null,
      run: (self) => Effect.flatMap(loadHarnesses, self.send),
    },
    // 2. Models
    models: {
      each: ({ model }) =>
        model.harness !== null &&
        !model.models.some(({ harness }) => harness === model.harness)
          ? [model.harness]
          : [],
      run: (self, harness) =>
        Effect.flatMap(loadModels(harness as Name), self.send),
    },
    // 3. Skills
    skills: {
      each: ({ model }) =>
        (model.harnesses ?? [])
          .filter(
            ({ name, available }) =>
              available &&
              !model.skills.some(({ harness }) => harness === name),
          )
          .map(({ name }) => name),
      run: (self, harness) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          yield* self.send(yield* loadSkills(props.projectId, harness as Name));
        }),
    },
  },
  on: {
    HarnessesLoaded: ({ harnesses }, { model }) => ({
      model: {
        ...model,
        harnesses,
        harness:
          model.harness ??
          (harnesses.find(({ available }) => available) ?? harnesses[0])
            ?.name ??
          null,
      },
    }),
    HarnessesFailed: ({ reason }, { model }) => ({
      model: { ...model, harnessProblem: reason },
    }),
    ModelsLoaded: ({ harness, models }, { model }) => ({
      model: {
        ...model,
        models: [
          ...model.models,
          { harness, status: 'ready', list: models, problem: null },
        ],
      },
    }),
    ModelsFailed: ({ harness, reason }, { model }) => ({
      model: {
        ...model,
        models: [
          ...model.models,
          { harness, status: 'failed', list: [], problem: reason },
        ],
      },
    }),
    SkillsLoaded: ({ harness, skills }, { model }) => ({
      model: {
        ...model,
        skills: [...model.skills, { harness, list: skills, problem: null }],
      },
    }),
    SkillsFailed: ({ harness, reason }, { model }) => ({
      model: {
        ...model,
        skills: [...model.skills, { harness, list: [], problem: reason }],
      },
    }),
    // Dropping the failed reads starts them again.
    RetrySkills: (_, { model }) =>
      model.skills.some(({ problem }) => problem !== null)
        ? {
            model: {
              ...model,
              skills: model.skills.filter(({ problem }) => problem === null),
            },
          }
        : {},
    Retry: (_, { model }) => ({
      model: {
        ...model,
        harnessProblem: null,
        models: model.models.filter(({ status }) => status === 'ready'),
      },
    }),
    PickHarness: ({ harness }, { model }) =>
      harness === model.harness
        ? {}
        : { model: { ...model, harness, model: null, settings: {} } },
    PickModel: ({ model: picked }, { model }) => ({
      model: { ...model, model: picked },
    }),
    PickSetting: ({ key, value }, { model }) => ({
      model: { ...model, settings: { ...model.settings, [key]: value } },
    }),
    Typed: ({ text }, { model }) => ({
      model: { ...model, text, problem: null },
    }),
    Attach: ({ attachments }, { model }) => ({
      model: { ...model, attachments, problem: null },
    }),
    // 5. Start
    Start: (_, { model, props }) => {
      const text = model.text.trim();
      const harness = model.harness;
      const picked = pickedModel(model);
      if (model.starting || harness === null || picked === null) return {};
      if (pickedHarness(model)?.available === false)
        return {
          model: {
            ...model,
            problem:
              pickedHarness(model)?.unavailableReason ??
              'This agent cannot run on this machine',
          },
        };
      if (text === '' && model.attachments.length === 0)
        return { model: { ...model, problem: 'Write the first message' } };
      return {
        model: { ...model, starting: true, problem: null },
        command: startSession({
          projectId: props.projectId,
          harness: harness as Name,
          model: picked,
          settings: pickedSettings(model),
          text,
          attachments: wire(model.attachments),
        }),
      };
    },
    Started: ({ sessionId }, { model, props }) => ({
      model: { ...model, text: '', attachments: [], starting: false },
      command: Router.push(session(props.projectId, sessionId)),
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, starting: false, problem: reason },
    }),
  },
});
