import { Effect, Option, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Preferences } from '../preferences/index.js';
import { Telemetry } from '../telemetry/index.js';
import {
  FiltersSchema,
  listTraces,
  NO_FILTERS,
  SpansSchema,
  type TraceGroup,
} from '../trace-model/index.js';

/*
 * The Feed: incoming Traces, newest first, as the list beside an opened
 * Trace.
 *
 * 1. Watch     every Span the DevTools Server keeps, live, from Telemetry.
 * 2. Narrow    by the Filters (service, status, attributes, since a
 *              moment) and the search, grouped by an attribute if asked.
 *              The Filters and the grouping are remembered across reloads.
 * 3. Hold      while a Trace is open, Traces that arrive are held back and
 *              counted, so the list does not move under the reader;
 *              revealing them, or closing the Trace, shows them.
 * 4. Open      picking a Trace tells the parent, which opens it.
 */

/** How many Traces the list shows at first, and how many more each time. */
export const PAGE_SIZE = 30;

const PREFERENCES_KEY = 'lotel:feed';

const FeedPreferences = Schema.Struct({
  filters: FiltersSchema,
  groupBy: Schema.NullOr(Schema.String),
  expanded: Schema.Record(Schema.String, Schema.Boolean),
});

const FeedModel = Schema.Struct({
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
});
type Model = typeof FeedModel.Type;

export const Feed = Actor.define('Feed', {
  requires: [Telemetry, Preferences],
  props: {
    /** The Trace open beside the list, if any. */
    opened: Schema.NullOr(Schema.String),
  },
  model: FeedModel,
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

// 2. Narrow
/** The Traces the Filters and the search keep, newest first. */
export const tracesListed = (model: Model): ReadonlyArray<TraceGroup> =>
  listTraces(model.spans, model.filters, model.search);

const idsOf = (traces: ReadonlyArray<TraceGroup>) =>
  traces.map((trace) => trace.traceId);

const sameIds = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((id, at) => id === right[at]);

// 3. Hold
/**
 * Whether the list is holding Traces back: a Trace is open, the first page
 * is in, and some Trace shown before is still listed. With none of them
 * left there is nothing to hold the reader's place, so all are shown.
 */
const holding = (
  listed: ReadonlyArray<string>,
  shown: ReadonlySet<string>,
  ready: boolean,
  opened: string | null,
) => ready && opened !== null && listed.some((id) => shown.has(id));

/** After any change to what is listed: what is shown follows it unless held. */
const settled = (model: Model, opened: string | null) => {
  const listed = idsOf(tracesListed(model));
  const shown = new Set(model.shown);
  return holding(listed, shown, model.ready, opened) ||
    sameIds(listed, model.shown)
    ? model
    : { ...model, shown: listed };
};

/** What the list draws: the Traces shown, those held back, and whether more wait below. */
export const listingOf = (model: Model, opened: string | null) => {
  const listed = tracesListed(model);
  const shown = new Set(model.shown);
  const held = holding(idsOf(listed), shown, model.ready, opened)
    ? listed.filter((trace) => !shown.has(trace.traceId)).length
    : 0;
  const visible =
    held === 0 ? listed : listed.filter((trace) => shown.has(trace.traceId));
  return {
    listed,
    traces: visible.slice(0, model.count),
    held,
    hasMore: listed.length - held > model.count,
  };
};

const preferencesOf = (model: Model) => ({
  filters: model.filters,
  groupBy: model.groupBy,
  expanded: model.expanded,
});

export const FeedLive = Feed.build({
  init: () => ({
    model: {
      spans: [],
      ready: false,
      search: '',
      filters: NO_FILTERS,
      groupBy: null,
      expanded: {},
      count: PAGE_SIZE,
      shown: [],
      restored: false,
    },
  }),
  workers: {
    // 1. Watch
    watch: {
      run: (self) =>
        Effect.gen(function* () {
          const telemetry = yield* Telemetry;
          yield* telemetry.live.pipe(
            Stream.runForEach(({ spans, ready }) =>
              self.send({ _tag: 'Received', spans, ready }),
            ),
          );
        }),
    },
    // 2. Narrow: the Filters as they were left, then each change kept.
    restore: {
      while: ({ model }) => !model.restored,
      run: (self) =>
        Effect.gen(function* () {
          const preferences = yield* Preferences;
          const saved = yield* preferences.load(
            PREFERENCES_KEY,
            FeedPreferences,
          );
          yield* self.send({
            _tag: 'Restored',
            saved: Option.getOrNull(saved),
          });
        }),
    },
    remember: {
      each: ({ model }) =>
        model.restored ? [JSON.stringify(preferencesOf(model))] : [],
      run: (self) =>
        Effect.gen(function* () {
          const preferences = yield* Preferences;
          const { model } = yield* self.get;
          yield* preferences.save(
            PREFERENCES_KEY,
            FeedPreferences,
            preferencesOf(model),
          );
        }),
    },
  },
  on: {
    Received: ({ spans, ready }, { model, props }) => ({
      model: settled({ ...model, spans, ready }, props.opened),
    }),
    Restored: ({ saved }, { model, props }) => ({
      model: settled({ ...model, ...saved, restored: true }, props.opened),
    }),
    Searched: ({ search }, { model, props }) => ({
      model: settled({ ...model, search }, props.opened),
    }),
    Filtered: ({ filters }, { model, props }) => ({
      model: settled({ ...model, filters }, props.opened),
    }),
    Grouped: ({ groupBy }) => ({ model: { groupBy } }),
    Toggled: ({ group }, { model }) => ({
      model: {
        expanded: {
          ...model.expanded,
          [group]: model.expanded[group] === false,
        },
      },
    }),
    ShowedMore: (_, { model }) => ({
      model: { count: model.count + PAGE_SIZE },
    }),
    Revealed: (_, { model }) => ({
      model: { shown: idsOf(tracesListed(model)) },
    }),
    // 4. Open: what is listed now is what the list holds while it is open.
    Picked: ({ traceId }, { model }) => ({
      model: { shown: idsOf(tracesListed(model)) },
      emit: { _tag: 'Opened', traceId },
    }),
  },
});
