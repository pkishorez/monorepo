import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Preferences } from '../../../services/preferences/contract/index.js';
import { Telemetry } from '../../../services/telemetry/contract/index.js';
import { Toasts } from '../../../services/toasts/contract/index.js';
import { TraceLayoutSchema } from './types.js';

/*
 * The Lotel Tool: a live Trace and Log Record inspector, the whole of it.
 * It knows nothing of URLs and draws no app header, so any app can mount
 * it.
 *
 * 1. Feed    the incoming Traces, always there (`children/actor-feed/`).
 * 2. Open    the Trace the Feed picks, beside it, until it is closed
 *            (`children/actor-trace/`). How an opened Trace is laid out is
 *            kept here, so the next one opens the same way, and remembered
 *            across reloads (`logic/workers.ts`).
 * 3. Clear   deleting every Span Record and Log Record on the DevTools
 *            Server, once confirmed; the Trace open goes with them
 *            (`logic/commands.ts`).
 */

const Clearing = Schema.Literals(['idle', 'confirming', 'clearing']);

export type Clearing = typeof Clearing.Type;

export const LotelShape = Actor.define('Lotel', {
  requires: [Telemetry, Preferences, Toasts],
  input: {},
  model: {
    /** The Trace open beside the Feed, if any. */
    opened: Schema.NullOr(Schema.String),
    layout: TraceLayoutSchema,
    /** Whether the remembered layout has been read back yet. */
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
