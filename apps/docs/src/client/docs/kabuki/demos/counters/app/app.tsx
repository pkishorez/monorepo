import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { CountersLive } from './counters.ts';
import { CountersView } from './counters-view.tsx';

// The list, its Counters and their Views, as one React component.
export const CountersApp = toReact(CountersLive, CountersView, Layer.empty, {
  name: 'demo:counters',
});
