import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Preferences } from '../../../../../services/preferences/contract/index.js';
import { Telemetry } from '../../../../../services/telemetry/contract/index.js';
import { SpansSchema } from '../../../../logic/shared/index.js';

/*
 * The Feed: incoming Traces, newest first, as the list beside an opened
 * Trace.
 *
 * 1. Watch     every Span the DevTools Server keeps, live, from Telemetry
 *              (`logic/workers.ts`).
 * 2. Narrow    by the Filters (service, status, attributes, since a
 *              moment) and the search, grouped by an attribute if asked.
 *              The Filters and the grouping are remembered across reloads.
 * 3. Hold      while a Trace is open, Traces that arrive are held back and
 *              counted, so the list does not move under the reader;
 *              revealing them, or closing the Trace, shows them
 *              (`logic/shared/selectors.ts`).
 * 4. Open      picking a Trace tells the parent, which opens it.
 */

const AttributeFilterSchema = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  value: Schema.String,
});
export type AttributeFilter = typeof AttributeFilterSchema.Type;

const TraceStatusFilterSchema = Schema.Literals(['all', 'error', 'running']);
export type TraceStatusFilter = typeof TraceStatusFilterSchema.Type;

const FiltersSchema = Schema.Struct({
  attributeFilters: Schema.Array(AttributeFilterSchema),
  /** Hides Traces that started before this moment, in epoch milliseconds. */
  sinceNow: Schema.NullOr(Schema.Number),
  status: TraceStatusFilterSchema,
});
export type Filters = typeof FiltersSchema.Type;

export const SERVICE_ATTR_KEY = 'resource.service.name';
export const NO_ROOT_SERVICE = '__no_root__';

export const GROUP_BY_TRACE_NAME = '__trace_name__';

/** What the Feed remembers across reloads. */
export const FeedPreferences = Schema.Struct({
  filters: FiltersSchema,
  groupBy: Schema.NullOr(Schema.String),
  expanded: Schema.Record(Schema.String, Schema.Boolean),
});

export const FeedShape = Actor.define('Feed', {
  requires: [Telemetry, Preferences],
  props: {
    /** The Trace open beside the list, if any. */
    opened: Schema.NullOr(Schema.String),
  },
  model: {
    spans: SpansSchema,
    /** Whether the first page of Spans has arrived. */
    ready: Schema.Boolean,
    search: Schema.String,
    filters: FiltersSchema,
    /** The Span attribute the list is grouped by, or none. */
    groupBy: Schema.NullOr(Schema.String),
    /** Groups by name; one not named here is expanded. */
    expanded: Schema.Record(Schema.String, Schema.Boolean),
    /** How many Traces the list shows. */
    count: Schema.Number,
    /** The Traces shown while a Trace is open; any other is held back. */
    shown: Schema.Array(Schema.String),
    /** Whether the remembered Filters have been read back yet. */
    restored: Schema.Boolean,
  },
  message: {
    Received: { spans: SpansSchema, ready: Schema.Boolean },
    Restored: { saved: Schema.NullOr(FeedPreferences) },
    Searched: { search: Schema.String },
    Filtered: { filters: FiltersSchema },
    Grouped: { groupBy: Schema.NullOr(Schema.String) },
    Toggled: { group: Schema.String },
    ShowedMore: {},
    Revealed: {},
    Picked: { traceId: Schema.String },
  },
  emits: { Opened: { traceId: Schema.String } },
});
