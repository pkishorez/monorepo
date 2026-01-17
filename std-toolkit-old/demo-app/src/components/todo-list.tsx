import { AnimatePresence } from 'motion/react';
import { TodoItem } from './todo-item';

interface TodoListProps {
  todos: { id: string }[];
}

export function TodoList({ todos }: TodoListProps) {
  if (todos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <AnimatePresence>
        {todos.map(({ id }) => (
          <TodoItem key={id} todoId={id} />
        ))}
      </AnimatePresence>
    </div>
  );
}
