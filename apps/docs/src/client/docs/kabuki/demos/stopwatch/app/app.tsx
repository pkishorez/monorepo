import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { StopwatchLive } from './stopwatch.ts';
import { StopwatchView } from './stopwatch-view.tsx';

// The Stopwatch and its View, as one React component: <StopwatchApp />.
export const StopwatchApp = toReact(StopwatchLive, StopwatchView, Layer.empty, {
  name: 'demo:stopwatch',
});
