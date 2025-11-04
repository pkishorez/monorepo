import { useLiveQuery } from '@tanstack/react-db';
import { todoCollection } from './collection';
import { ulid } from 'ulid';
import { useRef } from 'react';

export function App() {
  const {
    data,
    isReady,
    isCleanedUp,
    isEnabled,
    isLoading,
    state,
    status,
    isIdle,
    isError,
  } = useLiveQuery((q) =>
    q
      .from({ todo: todoCollection.collection })
      .orderBy((v) => v.todo.updatedAt, 'desc'),
  );
  const value = useRef(0);

  return (
    <>
      <h1>Bun + React</h1>
      <pre>
        {JSON.stringify(
          {
            isReady,
            isCleanedUp,
            isEnabled,
            isLoading,
            state,
            status,
            isIdle,
            isError,
          },
          null,
          2,
        )}
      </pre>
      <button
        onClick={() => {
          todoCollection.insert({
            todoId: ulid(),
            updatedAt: new Date().toISOString(),
            userId: 'test',
            title: 'Test todo!!!',
          });
        }}
      >
        Insert
      </button>
      {/* eslint-disable-next-line react-hooks/refs*/}
      <div>{++value.current}</div>
      <pre className="card">
        {data.map((v) => JSON.stringify(v)).join('\n')}
      </pre>
    </>
  );
}
