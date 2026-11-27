import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { storeLayer } from './capabilities/store/real/index.ts';
import { Store } from './capabilities/store/contract/index.ts';
import { Todo, TodoView } from './children/actor-todo/index.ts';
import {
  TodosShape,
  idsOf,
  init,
  isDone,
  load,
  loadFailed,
  sync,
  loaded,
  ready,
  retried,
  titleOf,
} from './logic/index.ts';
import { Body } from './view/index.ts';

export const Todos = TodosShape.build({
  init,
  states: {
    Loading: {
      workers: { load },
      on: { Loaded: loaded, LoadFailed: loadFailed },
    },
    Ready: {
      workers: { sync },
      provides: { capabilities: [Store], layer: storeLayer },
      children: {
        todos: Actor.child(Todo, {
          each: idsOf,
          input: (data, id) => ({ id, title: titleOf(data, id) }),
          props: (data, id) => ({ done: isDone(data, id) }),
          emits: {
            Toggled: (_, id) => ({ _tag: 'Toggled', id }),
            Deleted: (_, id) => ({ _tag: 'Deleted', id }),
          },
        }),
      },
      on: ready,
    },
    Failed: { on: { Retried: retried } },
  },
});

export const TodosView = View.make(Todos, (self) => (
  <Body
    {...self}
    todos={
      self._tag === 'Ready'
        ? self.children.todos.map((todo) => ({
            key: todo.key,
            view: <TodoView instance={todo} />,
          }))
        : []
    }
  />
));
