import { Context } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Server, Session, TodoApi } from '../../services/index.js';
import { Todos, TodosView } from './todos/index.js';

/** No Model of its own: it turns the Session into a TodoApi for everything below. */
export const Api = Node.make('Api', {
  requires: { server: Server, session: Session },
  provides: [TodoApi],
  children: { todos: Todos },
}).build({
  provides: ({ services: { server, session } }) =>
    Context.make(TodoApi, {
      list: server.listTodos(session.token),
      add: (text) => server.addTodo(session.token, text),
      toggle: (id) => server.toggleTodo(session.token, id),
    }),
});

export const ApiView = View.make(Api, ({ children }) => (
  <TodosView node={children.todos} />
));
