import type { DataOf } from '@kestack/kabuki/types';
import type { TodoShape } from './shape.ts';

export const shownTitleOf = ({ model, state }: DataOf<typeof TodoShape>) =>
  state._tag === 'Saving' || state._tag === 'Failed'
    ? state.title
    : model.title;
