import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { TickerLive } from './ticker.ts';
import { TickerView } from './ticker-view.tsx';

// The Ticker and its View, as one React component: <TickerApp />.
export const TickerApp = View.app(TickerView, {
  name: 'demo:managed-resource',
});
