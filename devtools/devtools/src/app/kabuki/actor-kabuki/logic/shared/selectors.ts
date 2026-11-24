import type { DataOf } from '@kestack/kabuki/types';
import type { KabukiShape, State } from './shape.js';

/** The Kabuki Session picked, live or not, or none. */
export const nameOf = (state: State) =>
  state._tag === 'Choice' ? null : state.name;

/** The Inspector's key: connected again under the same name, it is reached anew. */
export const inspectorKey = ({
  model,
  state,
}: DataOf<typeof KabukiShape, 'Inspection'>) =>
  `${state.name}@${model.sessions?.find((one) => one.name === state.name)?.connectedAt ?? 0}`;
