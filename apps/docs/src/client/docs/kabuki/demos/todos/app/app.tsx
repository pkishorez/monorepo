import { View } from '@kestack/kabuki/react';
import { TodosView } from './todos-view.tsx';

// The list, its to-dos and their Views, as one React component: <TodosApp />.
export const TodosApp = View.app(TodosView, { name: 'demo:todos' });
