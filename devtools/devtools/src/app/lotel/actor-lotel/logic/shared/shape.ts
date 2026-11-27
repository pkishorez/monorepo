import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Preferences } from '../../../../services/preferences/contract/index.js';
import { Telemetry } from '../../../services/telemetry/contract/index.js';
import { Toasts } from '../../../services/toasts/contract/index.js';
import { TraceLayoutSchema } from './types.js';

const Clearing = Schema.Literals(['idle', 'confirming', 'clearing']);

export type Clearing = typeof Clearing.Type;

export const LotelShape = Actor.define('Lotel', {
  requires: [Telemetry, Preferences, Toasts],
  input: {},
  model: {
    opened: Schema.NullOr(Schema.String),
    layout: TraceLayoutSchema,
    restored: Schema.Boolean,
    clearing: Clearing,
  },
  message: {
    Opened: { traceId: Schema.String },
    Closed: {},
    LaidOut: { layout: TraceLayoutSchema },
    Restored: { layout: Schema.NullOr(TraceLayoutSchema) },
    ClearAsked: {},
    ClearDismissed: {},
    ClearConfirmed: {},
    Cleared: { deleted: Schema.Number },
    ClearFailed: { message: Schema.String },
  },
});
