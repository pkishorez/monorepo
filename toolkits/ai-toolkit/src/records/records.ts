import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { HARNESS_NAMES } from '../raw/index.js';

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
}).build();

export type Session = typeof SessionSchema.Type;
