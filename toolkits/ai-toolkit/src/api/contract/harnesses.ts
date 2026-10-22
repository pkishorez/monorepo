import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { BinaryInfoSchema, SkillSchema } from '../../harness-wire/index.js';
import {
  InvalidBinary,
  ModelsUnavailable,
  ProjectNotFound,
  SkillsUnavailable,
} from './errors.js';
import { Harness } from './wire.js';

/* What each Coding Harness offers here, and the Harness Binary it runs. */

/** One agent-specific setting, with what a client draws a picker from. */
export const SettingInfo = Schema.Struct({
  key: Schema.String,
  label: Schema.String,
  choices: Schema.Array(
    Schema.Struct({ value: Schema.String, label: Schema.String }),
  ),
  default: Schema.String,
});

export const HarnessInfo = Schema.Struct({
  name: Harness,
  label: Schema.String,
  settings: Schema.Array(SettingInfo),
  /** The account's default model when the harness can say, else its own. */
  defaultModel: Schema.String,
  /** Its Harness Binary runs; a client offers it for new Sessions only then. */
  available: Schema.Boolean,
  /** Why its Harness Binary does not run; null when it does. */
  unavailableReason: Schema.NullOr(Schema.String),
});
export type HarnessInfo = typeof HarnessInfo.Type;

export const ModelInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** As models.dev gives it, `YYYY-MM-DD`; null when it lacks the model. */
  releaseDate: Schema.NullOr(Schema.String),
});
export type ModelInfo = typeof ModelInfo.Type;

/** A harness's Harness Binary: the path set for it, and what it resolved to. */
export const HarnessBinary = Schema.Struct({
  harness: Harness,
  /** null runs the harness's default. */
  configuredPath: Schema.NullOr(Schema.String),
  resolved: BinaryInfoSchema,
});
export type HarnessBinary = typeof HarnessBinary.Type;

export const HarnessesRpc = RpcGroup.make(
  /** Every Coding Harness this server runs. */
  Rpc.make('harnesses', { success: Schema.Array(HarnessInfo) }),
  /**
   * The models a harness can run on this machine's login, filled in from
   * models.dev, newest first; the models.dev models it accepts when the
   * login cannot be asked.
   */
  Rpc.make('models', {
    payload: { harness: Harness },
    success: Schema.Array(ModelInfo),
    error: ModelsUnavailable,
  }),
  /** The Skills a harness offers in a Project's folder. */
  Rpc.make('skills', {
    payload: { projectId: Schema.String, harness: Harness },
    success: Schema.Array(SkillSchema),
    error: Schema.Union([ProjectNotFound, SkillsUnavailable]),
  }),
  /** Every harness's Harness Binary. */
  Rpc.make('harnessBinaries', { success: Schema.Array(HarnessBinary) }),
  /** Sets a harness's Harness Binary once it runs; null goes back to the default. */
  Rpc.make('setHarnessBinary', {
    payload: { harness: Harness, path: Schema.NullOr(Schema.String) },
    success: HarnessBinary,
    error: InvalidBinary,
  }),
);
