import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { useRunEffectLatest } from 'use-effect-ts';
import { useLiveQuery } from '@tanstack/react-db';
import { todoCollection } from '@/frontend/collection';
import { TodoInput } from '@/components/todo-input';
import { TodoList } from '@/components/todo-list';
import { useState } from 'react';
import { Effect, Ref } from 'effect';
import { runtime } from '@/frontend/runtime';
import { ApiService } from '@/frontend/api';
import { cn } from '@/frontend/utils';

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
      .orderBy(({ todo }) => todo.updatedAt, 'desc')
      .select(({ todo }) => ({ id: todo.todoId, updatedAt: todo.updatedAt })),
  );

  const filteredTodos = data;

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

        <TodoInput />

        <div className="flex gap-2 justify-between mb-6">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'all'
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`,
              'flex gap-1 items-center',
            )}
          >
            All <span className="ml-1 opacity-70">{data.length}</span>
          </button>
          <Delay />
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
          <TodoList todos={filteredTodos} />
        )}
      </div>
    </div>
  );
};

function Delay() {
  const [value, setValue] = useState(0);

  const onUpdate = useRunEffectLatest(
    Effect.fn(function* (newValue: number) {
      const { delayRef } = yield* ApiService;
      yield* Ref.update(delayRef, () => newValue);
      setValue(newValue);
    }, Effect.provide(runtime)),
  );

  return (
    <div className="flex flex-col flex-start items-stretch gap-2">
      <span className="text-sm font-bold">
        API Delay simulation: {value} ms
      </span>
      <input
        type="range"
        min={0}
        max={10000}
        step={200}
        onChange={(e) => onUpdate(Number(e.target.value))}
        value={value}
      />
    </div>
  );
}
