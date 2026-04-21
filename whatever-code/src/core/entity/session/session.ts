import { EntityESchema } from '@std-toolkit/eschema';
import { Schema } from 'effect';
import { TaskStatus } from '../status.js';

export const InteractionMode = Schema.Literal('default', 'plan');
export const AccessMode = Schema.Literal('full-access');

export const ClaudePayload = Schema.Struct({
  type: Schema.Literal('claude'),
  accessMode: AccessMode,
  persistSession: Schema.Boolean,
  effort: Schema.Literal('low', 'medium', 'high', 'max'),
  maxTurns: Schema.Number,
  maxBudgetUsd: Schema.Number,
});

export const CodexPayload = Schema.Struct({
  type: Schema.Literal('codex'),
  accessMode: AccessMode,
  sdkThreadId: Schema.NullOr(Schema.String),
});

export const SessionPayload = Schema.Union(ClaudePayload, CodexPayload);

export const sessionEntity = EntityESchema.make('session', 'sessionId', {
  type: Schema.Literal('claude', 'codex'),
  status: TaskStatus,
  absolutePath: Schema.String,
  name: Schema.optionalWith(Schema.String, { exact: true }),
  model: Schema.String,
  interactionMode: Schema.optionalWith(InteractionMode, {
    exact: true,
    default: () => 'default' as const,
  }),
  payload: SessionPayload,
}).build();
