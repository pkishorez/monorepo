import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import type { TraceShape } from './shared/index.js';

export const init: InitOf<typeof TraceShape> = ({ traceId }) => ({
  model: { traceId, spans: [], ready: false, selectedSpanId: null },
});

export const updates: UpdatesOf<typeof TraceShape> = {
  Received: ({ spans, ready }) => ({ model: { spans, ready } }),
  Inspected: ({ spanId }) => ({ model: { selectedSpanId: spanId } }),
  LaidOut: ({ layout }) => ({ emit: { _tag: 'LaidOut', layout } }),
  Closed: () => ({ emit: { _tag: 'Closed' } }),
};
