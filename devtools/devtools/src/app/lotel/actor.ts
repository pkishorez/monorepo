import { Effect, Option, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { toast } from '@kestack/web-platform/ui/components/toast';
import { FeedLive } from './feed/index.js';
import { Preferences } from './preferences/index.js';
import { Telemetry } from './telemetry/index.js';
import {
  DEFAULT_TRACE_LAYOUT,
  TraceLayoutSchema,
  TraceLive,
} from './trace/index.js';

/*
 * The Lotel Tool: a live Trace and Log Record inspector, the whole of it.
 * It knows nothing of URLs and draws no app header, so any app can mount
 * it.
 *
 * 1. Feed    the incoming Traces, always there (`feed/`).
 * 2. Open    the Trace the Feed picks, beside it, until it is closed
 *            (`trace/`). How an opened Trace is laid out is kept here, so
 *            the next one opens the same way, and remembered across
 *            reloads.
 * 3. Clear   deleting every Span Record and Log Record on the DevTools
 *            Server, once confirmed; the Trace open goes with them.
 */

const PREFERENCES_KEY = 'lotel:trace-layout';

const Clearing = Schema.Literals(['idle', 'confirming', 'clearing']);

export const Lotel = Actor.define('Lotel', {
  requires: [Telemetry, Preferences],
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

// 3. Clear
const clear = Command.make('clear', {
  run: () =>
    Effect.gen(function* () {
      const telemetry = yield* Telemetry;
      const deleted = yield* telemetry.clear;
      return { _tag: 'Cleared' as const, deleted };
    }).pipe(
      Effect.catch((cause) =>
        Effect.succeed({
          _tag: 'ClearFailed' as const,
          message: cause.message,
        }),
      ),
    ),
});

/** Tells the reader how something went, in a toast. */
const notify = Command.make('notify', {
  args: Schema.Struct({
    type: Schema.Literals(['success', 'error']),
    title: Schema.String,
    description: Schema.optional(Schema.String),
  }),
  run: (shown) =>
    Effect.sync(() => {
      toast.add(shown);
    }),
});

export const LotelLive = Lotel.build({
  init: () => ({
    model: {
      opened: null,
      layout: DEFAULT_TRACE_LAYOUT,
      restored: false,
      clearing: 'idle',
    },
  }),
  children: {
    // 1. Feed
    feed: Actor.child(FeedLive, {
      props: ({ model }) => ({ opened: model.opened }),
      emits: { Opened: ({ traceId }) => ({ _tag: 'Opened', traceId }) },
    }),
    // 2. Open
    trace: Actor.child(TraceLive, {
      while: ({ model }) => model.opened !== null,
      key: ({ model }) => model.opened ?? '',
      input: ({ model }) => ({ traceId: model.opened ?? '' }),
      props: ({ model }) => ({ layout: model.layout }),
      emits: {
        LaidOut: ({ layout }) => ({ _tag: 'LaidOut', layout }),
        Closed: () => ({ _tag: 'Closed' }),
      },
    }),
  },
  workers: {
    // 2. Open: the layout as it was left, then each change kept.
    restore: {
      while: ({ model }) => !model.restored,
      run: (self) =>
        Effect.gen(function* () {
          const preferences = yield* Preferences;
          const saved = yield* preferences.load(
            PREFERENCES_KEY,
            TraceLayoutSchema,
          );
          yield* self.send({
            _tag: 'Restored',
            layout: Option.getOrNull(saved),
          });
        }),
    },
    remember: {
      each: ({ model }) =>
        model.restored ? [JSON.stringify(model.layout)] : [],
      run: (self) =>
        Effect.gen(function* () {
          const preferences = yield* Preferences;
          const { model } = yield* self.get;
          yield* preferences.save(
            PREFERENCES_KEY,
            TraceLayoutSchema,
            model.layout,
          );
        }),
    },
  },
  on: {
    Opened: ({ traceId }) => ({ model: { opened: traceId } }),
    Closed: () => ({ model: { opened: null } }),
    LaidOut: ({ layout }) => ({ model: { layout } }),
    Restored: ({ layout }, { model }) => ({
      model: { layout: layout ?? model.layout, restored: true },
    }),
    // 3. Clear
    ClearAsked: (_, { model }) =>
      model.clearing === 'idle' ? { model: { clearing: 'confirming' } } : {},
    ClearDismissed: (_, { model }) =>
      model.clearing === 'confirming' ? { model: { clearing: 'idle' } } : {},
    ClearConfirmed: (_, { model }) =>
      model.clearing === 'confirming'
        ? { model: { clearing: 'clearing' }, command: clear() }
        : {},
    Cleared: ({ deleted }) => ({
      model: { clearing: 'idle', opened: null },
      command: notify({
        type: 'success',
        title: `Cleared ${deleted} telemetry record${deleted === 1 ? '' : 's'}`,
      }),
    }),
    // The dialog stays open, to try again or cancel.
    ClearFailed: ({ message }) => ({
      model: { clearing: 'confirming' },
      command: notify({
        type: 'error',
        title: 'Could not clear telemetry',
        description: message,
      }),
    }),
  },
});
