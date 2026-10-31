import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { CounterLive } from './counter.ts';
import { CounterView } from './counter-view.tsx';

// The Counter and its View, as one React component: <CounterApp />.
export const CounterApp = View.app(CounterView, { name: 'demo:counter' });
