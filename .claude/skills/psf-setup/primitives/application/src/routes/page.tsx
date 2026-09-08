import { createFileRoute } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import { useState } from 'react';
import { greet } from '../shared/domain/greeting/index.ts';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  const [count, setCount] = useState(0);

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">__APP_TITLE__</h1>
      <p className="mt-3 text-muted-foreground">{greet('__APP_TITLE__')}</p>
      <Button
        type="button"
        className="mt-6 self-start"
        onClick={() => setCount((value) => value + 1)}
      >
        Clicked {count} times
      </Button>
    </main>
  );
}
