import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from '@tanstack/react-db';
import { todoCollection } from '@/frontend/collection';
import { ulid } from 'ulid';
import { runtime } from '@/frontend/runtime';
import { TodoInput } from '@/components/todo-input';
import { TodoList } from '@/components/todo-list';
import { useState } from 'react';

export const Route = createFileRoute('/')({
  component: App,
});

function App() {
  return (
    <ClientOnly>
      <AppClient />
    </ClientOnly>
  );
}

type FilterType = 'all' | 'active' | 'complete';

const AppClient = () => {
  const [filter, setFilter] = useState<FilterType>('all');

  const { data, isLoading } = useLiveQuery((q) =>
    q
      .from({ todo: todoCollection.collection })
      .orderBy((v) => v.todo.updatedAt, 'desc'),
  );

  const handleAdd = (text: string) => {
    runtime.runFork(
      todoCollection.insert({
        todoId: ulid(),
        updatedAt: new Date().toISOString(),
        userId: 'test',
        title: text,
        status: 'active',
      }),
    );
  };

  const handleToggle = (todo: any) => {
    runtime.runFork(
      todoCollection.update(
        { todoId: todo.todoId },
        { status: todo.status === 'active' ? 'complete' : 'active' },
      ),
    );
  };

  const handleUpdate = (todo: any, text: string) => {
    runtime.runFork(
      todoCollection.update({ todoId: todo.todoId }, { title: text }),
    );
  };

  const activeTodos = data.filter((item) => item.status === 'active');
  const completedTodos = data.filter((item) => item.status === 'complete');

  const filteredTodos =
    filter === 'active'
      ? activeTodos
      : filter === 'complete'
        ? completedTodos
        : data;

  const activeCount = activeTodos.length;
  const completedCount = completedTodos.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1
            className="text-4xl font-bold text-gray-900 mb-2"
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            }}
          >
            Todo List
          </h1>
          <p className="text-gray-500 text-sm">Stay organized and productive</p>
        </div>

        <TodoInput onAdd={handleAdd} />

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-gray-900 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            All <span className="ml-1 opacity-70">({data.length})</span>
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'active'
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            Active <span className="ml-1 opacity-70">({activeCount})</span>
          </button>
          <button
            onClick={() => setFilter('complete')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'complete'
                ? 'bg-green-500 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            Completed{' '}
            <span className="ml-1 opacity-70">({completedCount})</span>
          </button>
        </div>

        {isLoading ? (
          <div className="text-center text-gray-500 py-12">Loading...</div>
        ) : filteredTodos.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-5xl mb-4">📝</div>
            <p className="text-sm">
              {filter === 'all'
                ? 'No todos yet. Add one to get started!'
                : filter === 'active'
                  ? 'No active todos. Great job!'
                  : 'No completed todos yet.'}
            </p>
          </div>
        ) : (
          <TodoList
            todos={filteredTodos}
            onToggle={handleToggle}
            onUpdate={handleUpdate}
          />
        )}
        <div>
          {data.map((v) => (
            <pre key={v.todoId}>{JSON.stringify(v)}</pre>
          ))}
        </div>
      </div>
    </div>
  );
};
