import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Preferences } from '../../../../../services/preferences/contract/index.js';
import { Telemetry } from '../../../../../services/telemetry/contract/index.js';
import { SpansSchema } from '../../../../logic/shared/index.js';

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
  sinceNow: Schema.NullOr(Schema.Number),
  status: TraceStatusFilterSchema,
});
export type Filters = typeof FiltersSchema.Type;

export const SERVICE_ATTR_KEY = 'resource.service.name';
export const NO_ROOT_SERVICE = '__no_root__';

export const GROUP_BY_TRACE_NAME = '__trace_name__';

export const FeedPreferences = Schema.Struct({
  filters: FiltersSchema,
  groupBy: Schema.NullOr(Schema.String),
  expanded: Schema.Record(Schema.String, Schema.Boolean),
});

export const FeedShape = Actor.define('Feed', {
  requires: [Telemetry, Preferences],
  props: {
    opened: Schema.NullOr(Schema.String),
  },
  model: {
    spans: SpansSchema,
    ready: Schema.Boolean,
    search: Schema.String,
    filters: FiltersSchema,
    groupBy: Schema.NullOr(Schema.String),
    expanded: Schema.Record(Schema.String, Schema.Boolean),
    count: Schema.Number,
    shown: Schema.Array(Schema.String),
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
