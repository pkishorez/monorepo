import { View } from '@kestack/kabuki/react';
import { StopwatchView } from './stopwatch-view.tsx';

// The Stopwatch and its View, as one React component: <StopwatchApp />.
export const StopwatchApp = View.app(StopwatchView, { name: 'demo:stopwatch' });
