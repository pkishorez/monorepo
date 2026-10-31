import { View } from '@kestack/kabuki/react';
import { CounterView } from './counter-view.tsx';

// The Counter and its View, as one React component: <CounterApp />.
export const CounterApp = View.app(CounterView, { name: 'demo:counter' });
