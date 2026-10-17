import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { TodosLive } from './todos.ts';
import { TodosView } from './todos-view.tsx';

// The list, its to-dos and their Views, as one React component: <TodosApp />.
export const TodosApp = toReact(TodosLive, TodosView, Layer.empty, {
  name: 'demo:todos',
});
