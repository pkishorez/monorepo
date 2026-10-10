import { View } from 'effect-oak/react';
import { ComposerView } from './composer/index.js';
import { Footer } from './footer/index.js';
import { TodoItem } from './item/index.js';
import { shown } from './list.js';
import { Todos } from './todo.js';

const EMPTY = {
  All: 'No todos yet. Add one above!',
  Active: 'No active todos',
  Completed: 'No completed todos',
};

export const TodosView = View.make(Todos, {
  Loading: () => null,
  Ready: ({ state, children, send }) => {
    const { todos, filter, editing } = state;
    const completed = todos.filter((todo) => todo.completed).length;
    const visible = shown(todos, filter);
    return (
      <div className="size-full overflow-y-auto p-6">
        <div className="mx-auto flex max-w-md flex-col gap-6">
          <ComposerView node={children.composer} />
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {EMPTY[filter]}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visible.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  editing={
                    editing._tag === 'Editing' && editing.id === todo.id
                      ? editing.text
                      : null
                  }
                  actions={{
                    toggle: () => send({ _tag: 'ToggledTodo', id: todo.id }),
                    remove: () => send({ _tag: 'DeletedTodo', id: todo.id }),
                    startEditing: () =>
                      send({ _tag: 'StartedEditing', id: todo.id }),
                    typeEdit: (text) =>
                      send({ _tag: 'UpdatedEditingTodo', text }),
                    saveEdit: () => send({ _tag: 'SavedEdit' }),
                    cancelEdit: () => send({ _tag: 'CancelledEdit' }),
                  }}
                />
              ))}
            </ul>
          )}
          {todos.length > 0 && (
            <Footer
              active={todos.length - completed}
              completed={completed}
              filter={filter}
              onFilter={(each) =>
                send({ _tag: 'SelectedFilter', filter: each })
              }
              onToggleAll={() => send({ _tag: 'ToggledAll' })}
              onClearCompleted={() => send({ _tag: 'ClearedCompleted' })}
            />
          )}
        </div>
      </div>
    );
  },
});
