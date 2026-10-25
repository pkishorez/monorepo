import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { JsonSchema } from './json.js';

export const HARNESS_NAMES = ['claude', 'codex'] as const;
export type HarnessName = (typeof HARNESS_NAMES)[number];

/** Who wrote a Raw record: a Coding Harness, or the engine itself. */
export const RAW_SOURCES = [...HARNESS_NAMES, 'engine'] as const;
export type RawSource = (typeof RAW_SOURCES)[number];

/**
 * One whole thing a Coding Harness emitted, stored as it arrived: a whole
 * assistant message, a tool use, a tool result, a turn result. Never a token
 * delta. Only its writer's `project` understands `payload`.
 */
export const RawSchema = EntityESchema.make('AiRaw', 'id', {
  sessionId: Schema.String,
  turnId: Schema.String,
  harness: Schema.Literals(RAW_SOURCES),
  /** The writer's own name for it: a Claude message type, a Codex method. */
  kind: Schema.String,
  /**
   * The subagent this record belongs to, as its writer knew it at the time:
   * the id of the tool call that spawned it, or null for the main agent.
   */
  agentId: Schema.NullOr(Schema.String),
  payload: JsonSchema,
  at: Schema.Finite,
}).build();

export type Raw = typeof RawSchema.Type;
