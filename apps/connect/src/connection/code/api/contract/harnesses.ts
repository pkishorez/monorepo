import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';
import {
  BinaryInfoSchema,
  ConfigFolderInfoSchema,
  ModelInfo,
  SkillSchema,
} from '@kestack/ai-toolkit/contract';
import {
  InvalidAccount,
  InvalidBinary,
  ModelsUnavailable,
  ProjectNotFound,
  SkillsUnavailable,
} from './errors.js';
import { Harness } from './wire.js';

/*
 * The Harness Accounts here, what each offers, and the Harness Binary and
 * config folder each runs with. Each harness has a Default Account, whose
 * id is the harness's name; the user may add others, such as a second
 * Claude login.
 */

/** One agent-specific setting, with what a client draws a picker from. */
export const SettingInfo = ESchema.make('SettingInfo', {
  key: Schema.String,
  label: Schema.String,
  choices: Schema.Array(
    Schema.Struct({ value: Schema.String, label: Schema.String }),
  ),
  default: Schema.String,
}).build();

/** One Harness Account, as a client offers it for a new Session. */
export const HarnessInfo = ESchema.make('HarnessInfo', {
  /** The Harness Account's id, which a new Session runs as. */
  account: Schema.String,
  /** Its harness. */
  harness: Harness,
  /** The account's name, such as "Claude" or "Claude work". */
  name: Schema.String,
  settings: Schema.Array(SettingInfo.schema),
  /** The account's default model when the harness can say, else its own. */
  defaultModel: Schema.String,
  /** Its Harness Binary runs; a client offers it for new Sessions only then. */
  available: Schema.Boolean,
  /** Why its Harness Binary does not run, such as how to install it; null when it does. */
  unavailableReason: Schema.NullOr(Schema.String),
}).build();
export type HarnessInfo = typeof HarnessInfo.Type;

/** A Harness Account as the user sets it, and what its binary resolved to. */
export const HarnessAccountInfo = ESchema.make('HarnessAccountInfo', {
  id: Schema.String,
  harness: Harness,
  name: Schema.String,
  /** null runs the harness's name from PATH. */
  binaryPath: Schema.NullOr(Schema.String),
  /** Its config folder (CLAUDE_CONFIG_DIR, CODEX_HOME) as the user set it; null for none. */
  configFolder: Schema.NullOr(Schema.String),
  /** Its harness's Default Account, which cannot be removed. */
  isDefault: Schema.Boolean,
  resolved: BinaryInfoSchema,
})
  /**
   * v2: the config folder it really runs with: `configFolder`; else, with
   * none, the variable set in this Connection's environment; else the
   * harness's own. A Connection on a Connect from before it says nothing:
   * null.
   */
  .evolve(
    'v2',
    { resolvedConfigFolder: Schema.NullOr(ConfigFolderInfoSchema) },
    (v1) => ({ ...v1, resolvedConfigFolder: null }),
  )
  .build();
export type HarnessAccountInfo = typeof HarnessAccountInfo.Type;

/** A Language Model a harness runs, as the wire carries it. */
const ModelValue = ESchema.make('ModelInfo', ModelInfo.fields).build();

/** A folder's Skills; a Skill's argument hint is optional, so the list is one value. */
const Skills = ValueESchema.make('Skills', Schema.Array(SkillSchema)).build();

export const HarnessesRpc = RpcGroup.make(
  /** Every Harness Account, each harness's Default Account first. */
  Rpc.make('harnesses', { success: Schema.Array(HarnessInfo.schema) }),
  /**
   * The models a Harness Account's login can run, filled in from
   * models.dev, newest first; the models.dev models its harness accepts
   * when the login cannot be asked.
   */
  Rpc.make('models', {
    payload: ESchema.make('ModelsPayload', {
      account: Schema.String,
    }).build().schema,
    success: Schema.Array(ModelValue.schema),
    error: ModelsUnavailable,
  }),
  /** The Skills a Harness Account offers in a Project's folder. */
  Rpc.make('skills', {
    payload: ESchema.make('SkillsPayload', {
      projectId: Schema.String,
      account: Schema.String,
    }).build().schema,
    success: Skills.schema,
    error: Schema.Union([ProjectNotFound, SkillsUnavailable]),
  }),
  /** Every Harness Account as the user set it. */
  Rpc.make('harnessAccounts', {
    success: Schema.Array(HarnessAccountInfo.schema),
  }),
  /**
   * Saves a Harness Account once it has a name, its binary runs and its
   * config folder is a folder; a new one when `id` is null. A null binary
   * runs the harness from PATH; a null config folder, the harness's own folder.
   */
  Rpc.make('saveHarnessAccount', {
    payload: ESchema.make('SaveHarnessAccountPayload', {
      id: Schema.NullOr(Schema.String),
      harness: Harness,
      name: Schema.String,
      binaryPath: Schema.NullOr(Schema.String),
      configFolder: Schema.NullOr(Schema.String),
    }).build().schema,
    success: HarnessAccountInfo.schema,
    error: Schema.Union([InvalidBinary, InvalidAccount]),
  }),
  /** Removes an account the user added; its Sessions fail their next Turn. */
  Rpc.make('removeHarnessAccount', {
    payload: ESchema.make('RemoveHarnessAccountPayload', {
      id: Schema.String,
    }).build().schema,
    error: InvalidAccount,
  }),
);
