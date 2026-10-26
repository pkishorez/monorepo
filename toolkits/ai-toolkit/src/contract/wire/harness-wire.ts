import { Schema } from 'effect';
import { JsonSchema } from '../raw/index.js';

/*
 * What a Coding Harness takes and tells that also crosses the wire: the
 * harness contract and the API speak the same shapes, so both read them
 * from here.
 */

/** A Language Model a harness runs, filled in from models.dev. */
export const ModelInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** As models.dev gives it, `YYYY-MM-DD`; null when it lacks the model. */
  releaseDate: Schema.NullOr(Schema.String),
});
export type ModelInfo = typeof ModelInfo.Type;

/** A file sent with a user message, as the client sends it. */
export const AttachmentSchema = Schema.Struct({
  name: Schema.String,
  mime: Schema.String,
  /** Base64, without a `data:` prefix. */
  data: Schema.String,
});
export type Attachment = typeof AttachmentSchema.Type;

/** A Skill a harness offers in a folder, invoked as `/name args`. */
export const SkillSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  argumentHint: Schema.optionalKey(Schema.String),
});
export type Skill = typeof SkillSchema.Type;

export const BACKGROUND_JOB_KINDS = ['shell', 'agent'] as const;
export type BackgroundJobKind = (typeof BACKGROUND_JOB_KINDS)[number];

/** Work an agent started that outlives the Turn that started it. */
export const BackgroundJobSchema = Schema.Struct({
  /** The harness's own id: a Claude task id, a Codex process or thread id. */
  id: Schema.String,
  kind: Schema.Literals(BACKGROUND_JOB_KINDS),
  /** One line a person reads: the command, or what the subagent does. */
  title: Schema.String,
  /** Epoch ms, when the harness says. */
  startedAt: Schema.optionalKey(Schema.Finite),
});
export type BackgroundJob = typeof BackgroundJobSchema.Type;

export const MCP_SERVER_STATES = [
  'connected',
  'failed',
  'needs-auth',
  'pending',
  'disabled',
] as const;
export type McpServerState = (typeof MCP_SERVER_STATES)[number];

export const McpServerStatusSchema = Schema.Struct({
  name: Schema.String,
  status: Schema.Literals(MCP_SERVER_STATES),
  error: Schema.optionalKey(Schema.String),
  /** How many tools it offers, when known. */
  tools: Schema.optionalKey(Schema.Finite),
});
export type McpServerStatus = typeof McpServerStatusSchema.Type;

export const RateLimitSchema = Schema.Struct({
  label: Schema.String,
  usedPercent: Schema.Finite,
  /** Epoch ms. */
  resetsAt: Schema.optionalKey(Schema.Finite),
});

/** How full a Session's context window is, and the account's rate limits. */
export const ContextUsageSchema = Schema.Struct({
  usedTokens: Schema.optionalKey(Schema.Finite),
  maxTokens: Schema.optionalKey(Schema.Finite),
  rateLimits: Schema.Array(RateLimitSchema),
});
export type ContextUsage = typeof ContextUsageSchema.Type;

/** An Ask's answer: text, or data shaped by the schema it was given. */
export const AskAnswerSchema = Schema.Union([
  Schema.TaggedStruct('Text', { text: Schema.String }),
  Schema.TaggedStruct('Data', { data: JsonSchema }),
]);
export type AskAnswer = typeof AskAnswerSchema.Type;

/** A Harness Binary as this machine has it. */
export const BinaryInfoSchema = Schema.Struct({
  /** The executable it resolved to; null when none was found. */
  path: Schema.NullOr(Schema.String),
  /** What `--version` printed; null when it could not run. */
  version: Schema.NullOr(Schema.String),
  /** Why it cannot run; null when it can. */
  error: Schema.NullOr(Schema.String),
  /** No path is configured, so the harness's default is used. */
  isDefault: Schema.Boolean,
});
export type BinaryInfo = typeof BinaryInfoSchema.Type;

/**
 * The config folder a Harness Account really uses: its own (`account`);
 * else the harness's variable, such as `CLAUDE_CONFIG_DIR`, in the
 * environment it runs in (`environment`); else the harness's own folder
 * under home (`default`).
 */
export const ConfigFolderInfoSchema = Schema.Union([
  Schema.Struct({
    path: Schema.String,
    from: Schema.Literals(['account', 'default']),
  }),
  Schema.Struct({
    path: Schema.String,
    from: Schema.Literal('environment'),
    /** The variable it was read from. */
    variable: Schema.String,
  }),
]);
export type ConfigFolderInfo = typeof ConfigFolderInfoSchema.Type;
