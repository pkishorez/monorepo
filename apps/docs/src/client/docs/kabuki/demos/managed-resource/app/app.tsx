import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { TickerLive } from './ticker.ts';
import { TickerView } from './ticker-view.tsx';

// The Ticker and its View, as one React component: <TickerApp />.
export const TickerApp = toReact(TickerLive, TickerView, Layer.empty, {
  name: 'demo:managed-resource',
});
