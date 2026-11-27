import type { DataOf } from '@kestack/kabuki/types';
import type { KabukiShape, State } from './shape.js';

export const nameOf = (state: State) =>
  state._tag === 'Choice' ? null : state.name;

const summaryOf = ({
  model,
  state,
}: DataOf<typeof KabukiShape, 'Inspection'>) =>
  model.sessions?.find((one) => one.name === state.name);

export const appOf = (data: DataOf<typeof KabukiShape, 'Inspection'>) =>
  summaryOf(data)?.app ?? data.state.name;

export const inspectionKey = (data: DataOf<typeof KabukiShape, 'Inspection'>) =>
  `${data.state.name}@${summaryOf(data)?.connectedAt ?? 0}`;
