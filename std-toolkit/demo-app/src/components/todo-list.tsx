import { AnimatePresence } from 'motion/react';
import { TodoItem } from './todo-item';
import { todoCollection } from '@/frontend/collection';

type Todo = typeof todoCollection.Type;
interface TodoListProps {
  todos: (typeof todoCollection.TypeWithOptimistic)[];
  onToggle: (todo: Todo) => void;
  onUpdate: (todo: Todo, text: string) => void;
}

export function TodoList({ todos, onToggle, onUpdate }: TodoListProps) {
  if (todos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <AnimatePresence>
        {todos.map((todo) => (
          <TodoItem
            key={todo.todoId}
            todo={todo}
            onToggle={() => onToggle(todo)}
            onUpdate={(text) => onUpdate(todo, text)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
