import type { DataOf } from '@kestack/kabuki/types';
import type { StoryShape } from '../index.js';
import { titleOf } from './turns.js';

type Data = DataOf<typeof StoryShape>;

export const threadsOf = ({ model }: Data) => {
  const listed = model.threads.map(({ id, title }) => ({
    id,
    title: id === model.thread ? titleOf(model.turns) || title : title,
  }));
  return model.thread === null || listed.some(({ id }) => id === model.thread)
    ? listed
    : [{ id: model.thread, title: titleOf(model.turns) }, ...listed];
};
