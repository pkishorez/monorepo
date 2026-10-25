import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { HARNESS_NAMES } from '@kestack/ai-toolkit/contract';

/** A folder on this machine that sessions run in. Its name is the folder's name. */
export const ProjectSchema = EntityESchema.make('AiProject', 'id', {
  path: Schema.String,
  name: Schema.String,
  createdAt: Schema.Finite,
}).build();

export type Project = typeof ProjectSchema.Type;

/**
 * - idle         its last turn finished, or it has none.
 * - running      a turn is under way.
 * - cancelled    its last turn was stopped by the user.
 * - failed       its last turn ended in an error.
 * - interrupted  its last turn was cut off by the server stopping.
 */
export const SESSION_STATUSES = [
  'idle',
  'running',
  'cancelled',
  'failed',
  'interrupted',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

const ForkedFrom = Schema.Struct({
  sessionId: Schema.String,
  turnId: Schema.String,
});

/** One conversation with a Coding Harness in a Project's folder. */
export const SessionSchema = EntityESchema.make('AiSession', 'id', {
  projectId: Schema.String,
  harness: Schema.Literals(HARNESS_NAMES),
  model: Schema.String,
  /** Values for the harness's Settings, by key. */
  settings: Schema.Record(Schema.String, Schema.String),
  title: Schema.String,
  status: Schema.Literals(SESSION_STATUSES),
  /** The harness's own session id, to resume its context after a restart. */
  nativeId: Schema.NullOr(Schema.String),
  createdAt: Schema.Finite,
  /**
   * The Session and Turn this one was forked after; null when it was not.
   * That Session's Messages hold the Turn, up to its `turnEnded`.
   */
  forkedFrom: Schema.NullOr(ForkedFrom),
  /** When the user Settled it; null while it is not Settled. */
  settledAt: Schema.NullOr(Schema.Finite),
  /** When a Turn last started in it, or when it was made. */
  activeAt: Schema.Finite,
  /** When its last Turn ended, however it ended; null until one has. */
  endedAt: Schema.NullOr(Schema.Finite),
}).build();

export type Session = typeof SessionSchema.Type;

/**
 * The Harness Binary one harness is set to run, by harness name. A harness
 * with no record runs its default.
 */
export const HarnessConfigSchema = EntityESchema.make('AiHarnessConfig', 'id', {
  harness: Schema.Literals(HARNESS_NAMES),
  /** The executable to run; null for the harness's default. */
  binaryPath: Schema.NullOr(Schema.String),
  updatedAt: Schema.Finite,
}).build();

export type HarnessConfig = typeof HarnessConfigSchema.Type;
