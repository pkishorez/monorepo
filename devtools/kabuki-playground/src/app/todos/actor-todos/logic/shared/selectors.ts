import type { DataOf } from '@kestack/kabuki/types';
import type { TodosShape } from './shape.ts';

type Data = DataOf<typeof TodosShape>;

export const idsOf = ({ model }: Data) => model.todos.map(({ id }) => id);

export const titleOf = ({ model }: Data, id: string) =>
  model.todos.find((todo) => todo.id === id)?.title ?? '';

export const isDone = ({ model }: Data, id: string) => model.done.includes(id);

export const allDone = ({ model }: Data) =>
  model.todos.length > 0 && model.done.length === model.todos.length;

export const leftOf = ({ model }: Data) =>
  model.todos.length - model.done.length;
