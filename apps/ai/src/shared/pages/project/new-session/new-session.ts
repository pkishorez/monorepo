import { Effect, Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import {
  HarnessInfo,
  loadHarnesses,
  loadModels,
  ModelInfo,
  Refused,
  startSession,
} from '../../ai/index.ts';
import { session } from '../../places/index.ts';

/*
 * Starting a session in a project: which agent, which model, the agent's
 * own settings, and the first message.
 *
 * 1. Agents   read once from the server; the first is picked.
 * 2. Models   read per agent the first time it is picked, newest first;
 *             until one is picked, the agent's default.
 * 3. Settings each the agent's default until one is picked.
 * 4. Start    the session starts already running the first message, and
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

const Model = Schema.Struct({
  harnesses: Schema.NullOr(Schema.Array(HarnessInfo)),
  harnessProblem: Schema.NullOr(Schema.String),
  harness: Schema.NullOr(Name),
  models: Schema.Array(Models),
  /** null: the agent's default. */
  model: Schema.NullOr(Schema.String),
  /** The settings picked; any other is its default. */
  settings: Schema.Record(Schema.String, Schema.String),
  text: Schema.String,
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
    Retry: {},
    PickHarness: { harness: Name },
    PickModel: { model: Schema.String },
    PickSetting: { key: Schema.String, value: Schema.String },
    Typed: { text: Schema.String },
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
      text: '',
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
  },
  on: {
    HarnessesLoaded: ({ harnesses }, { model }) => ({
      model: {
        ...model,
        harnesses,
        harness: model.harness ?? harnesses[0]?.name ?? null,
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
    // 4. Start
    Start: (_, { model, props }) => {
      const text = model.text.trim();
      const harness = model.harness;
      const picked = pickedModel(model);
      if (model.starting || harness === null || picked === null) return {};
      if (text === '')
        return { model: { ...model, problem: 'Write the first message' } };
      return {
        model: { ...model, starting: true, problem: null },
        command: startSession({
          projectId: props.projectId,
          harness: harness as Name,
          model: picked,
          settings: pickedSettings(model),
          text,
        }),
      };
    },
    Started: ({ sessionId }, { model, props }) => ({
      model: { ...model, text: '', starting: false },
      command: Router.push(session(props.projectId, sessionId)),
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, starting: false, problem: reason },
    }),
  },
});
