import type { DataOf } from '@kestack/kabuki/types';
import type { KabukiShape, State } from './shape.js';

export const nameOf = (state: State) =>
  state._tag === 'Choice' ? null : state.name;

export const inspectorKey = ({
  model,
  state,
}: DataOf<typeof KabukiShape, 'Inspection'>) =>
  `${state.name}@${model.sessions?.find((one) => one.name === state.name)?.connectedAt ?? 0}`;
