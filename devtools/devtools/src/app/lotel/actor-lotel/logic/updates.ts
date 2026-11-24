import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { clear, notify } from './commands.js';
import type { LotelShape, TraceLayout } from './shared/index.js';

/** How a Trace is laid out until it is laid out otherwise. */
const DEFAULT_TRACE_LAYOUT: TraceLayout = {
  view: 'waterfall',
  sidebarWidth: 360,
  nameColWidth: 248,
  sidebarOpen: true,
};

export const init: InitOf<typeof LotelShape> = () => ({
  model: {
    opened: null,
    layout: DEFAULT_TRACE_LAYOUT,
    restored: false,
    clearing: 'idle',
  },
});

export const updates: UpdatesOf<typeof LotelShape> = {
  // 2. Open
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
};
