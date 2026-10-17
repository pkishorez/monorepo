import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { CounterLive } from './counter.ts';
import { CounterView } from './counter-view.tsx';

// The Counter and its View, as one React component: <CounterApp />.
export const CounterApp = toReact(CounterLive, CounterView, Layer.empty, {
  name: 'demo:counter',
});
