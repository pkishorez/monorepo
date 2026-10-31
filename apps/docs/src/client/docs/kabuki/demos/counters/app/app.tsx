import { View } from '@kestack/kabuki/react';
import { CountersView } from './counters-view.tsx';

// The list, its Counters and their Views, as one React component.
export const CountersApp = View.app(CountersView, { name: 'demo:counters' });
