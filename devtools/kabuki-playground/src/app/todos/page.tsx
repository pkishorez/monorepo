import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page } from '@kestack/kabuki/routing';
import { Todos, TodosView } from './actor-todos/index.ts';

export const TodosPage = Page.define({ path: '/' });

export const TodosPageLive = TodosPage.build({
  children: { todos: Actor.child(Todos) },
});

export const TodosPageView = View.make(TodosPageLive, ({ children }) => (
  <TodosView instance={children.todos} />
));
