import { createFileRoute } from '@tanstack/react-router';
import { Effect, Exit } from 'effect';
import { useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { useComponentLifecycle } from 'use-effect-ts';
import { Rpc } from '../client/rpc/index.ts';
import { useRpc } from './internal/rpc-provider';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  const connection = useRpc();
  const [greeting, setGreeting] = useState('Connecting…');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(true);

  useComponentLifecycle(
    Effect.gen(function* () {
      if (connection.status !== 'ready') return;
      yield* Effect.sync(() => {
        setPending(true);
        setGreeting('Connecting…');
      });

      const context = yield* connection.runtime.contextEffect;
      const exit = yield* Effect.gen(function* () {
        const rpc = yield* Rpc;
        return yield* rpc.Hello();
      }).pipe(
        Effect.provide(context),
        Effect.timeout('10 seconds'),
        Effect.exit,
      );

      yield* Effect.sync(() => {
        setGreeting(
          Exit.isSuccess(exit)
            ? exit.value
            : 'Could not connect. Please try again.',
        );
        setPending(false);
      });
    }),
    { deps: [connection, attempt] },
  );

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">__APP_TITLE__</h1>
      <p
        className="mt-3 text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {connection.status === 'error'
          ? 'Could not connect. Reload to try again.'
          : greeting}
      </p>
      <Button
        type="button"
        className="mt-6 self-start"
        disabled={connection.status !== 'ready' || pending}
        onClick={() => setAttempt((value) => value + 1)}
      >
        Refresh
      </Button>
    </main>
  );
}
