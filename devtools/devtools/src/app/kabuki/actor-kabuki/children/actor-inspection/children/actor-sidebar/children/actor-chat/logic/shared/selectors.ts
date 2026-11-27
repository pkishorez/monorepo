import type { DataOf } from '@kestack/kabuki/types';
import type { ChatShape } from './shape.js';

export const threadsOf = ({ model }: DataOf<typeof ChatShape>) => {
  const title = model.turns[0]?.question ?? '';
  const listed = model.threads.map(({ id, title: one }) => ({
    id,
    title: id === model.thread ? title || one : one,
  }));
  return model.thread === null || listed.some(({ id }) => id === model.thread)
    ? listed
    : [{ id: model.thread, title }, ...listed];
};
