import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import {
  BinaryInfoSchema,
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
export const SettingInfo = Schema.Struct({
  key: Schema.String,
  label: Schema.String,
  choices: Schema.Array(
    Schema.Struct({ value: Schema.String, label: Schema.String }),
  ),
  default: Schema.String,
});

/** One Harness Account, as a client offers it for a new Session. */
export const HarnessInfo = Schema.Struct({
  /** The Harness Account's id, which a new Session runs as. */
  account: Schema.String,
  /** Its harness. */
  name: Harness,
  /** The account's name, such as "Claude" or "Claude work". */
  label: Schema.String,
  settings: Schema.Array(SettingInfo),
  /** The account's default model when the harness can say, else its own. */
  defaultModel: Schema.String,
  /** Its Harness Binary runs; a client offers it for new Sessions only then. */
  available: Schema.Boolean,
  /** Why its Harness Binary does not run, such as how to install it; null when it does. */
  unavailableReason: Schema.NullOr(Schema.String),
});
export type HarnessInfo = typeof HarnessInfo.Type;

/** A Harness Account as the user sets it, and what its binary resolved to. */
export const HarnessAccountInfo = Schema.Struct({
  id: Schema.String,
  harness: Harness,
  name: Schema.String,
  /** null runs the harness's name from PATH. */
  binaryPath: Schema.NullOr(Schema.String),
  /** Its config folder (CLAUDE_CONFIG_DIR, CODEX_HOME); null for the harness's own. */
  home: Schema.NullOr(Schema.String),
  /** Its harness's Default Account, which cannot be removed. */
  isDefault: Schema.Boolean,
  resolved: BinaryInfoSchema,
});
export type HarnessAccountInfo = typeof HarnessAccountInfo.Type;

export const HarnessesRpc = RpcGroup.make(
  /** Every Harness Account, each harness's Default Account first. */
  Rpc.make('harnesses', { success: Schema.Array(HarnessInfo) }),
  /**
   * The models a Harness Account's login can run, filled in from
   * models.dev, newest first; the models.dev models its harness accepts
   * when the login cannot be asked.
   */
  Rpc.make('models', {
    payload: { account: Schema.String },
    success: Schema.Array(ModelInfo),
    error: ModelsUnavailable,
  }),
  /** The Skills a Harness Account offers in a Project's folder. */
  Rpc.make('skills', {
    payload: { projectId: Schema.String, account: Schema.String },
    success: Schema.Array(SkillSchema),
    error: Schema.Union([ProjectNotFound, SkillsUnavailable]),
  }),
  /** Every Harness Account as the user set it. */
  Rpc.make('harnessAccounts', { success: Schema.Array(HarnessAccountInfo) }),
  /**
   * Saves a Harness Account once it has a name, its binary runs and its
   * config folder is a folder; a new one when `id` is null. A null binary
   * runs the harness from PATH; a null home, the harness's own folder.
   */
  Rpc.make('saveHarnessAccount', {
    payload: {
      id: Schema.NullOr(Schema.String),
      harness: Harness,
      name: Schema.String,
      binaryPath: Schema.NullOr(Schema.String),
      home: Schema.NullOr(Schema.String),
    },
    success: HarnessAccountInfo,
    error: Schema.Union([InvalidBinary, InvalidAccount]),
  }),
  /** Removes an account the user added; its Sessions fail their next Turn. */
  Rpc.make('removeHarnessAccount', {
    payload: { id: Schema.String },
    error: InvalidAccount,
  }),
);
