import { createFileRoute } from '@tanstack/react-router';
import { Effect, Exit } from 'effect';
import type { ManagedRuntime } from 'effect';
import { Button } from 'kui-toolkit/components/ui/button';
import { useState } from 'react';
import { useComponentLifecycle } from 'use-effect-ts';
import { __Name__Rpc } from '../client/rpc/__NAME__/index.ts';
import { use__Name__Rpc } from './internal/__NAME__-rpc-provider';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  const __NAME__ = use__Name__Rpc();

  // One <Greeting> per RPC instance.
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">__APP_TITLE__</h1>
      <Greeting
        label="__Name__ (WebSocket)"
        connection={__NAME__}
        hello={Effect.gen(function* () {
          const rpc = yield* __Name__Rpc;
          return yield* rpc.Hello();
        })}
      />
    </main>
  );
}

type Connection<R> =
  | { status: 'connecting' }
  | { status: 'ready'; runtime: ManagedRuntime.ManagedRuntime<R, never> }
  | { status: 'error'; message: string };

function Greeting<R>({
  label,
  connection,
  hello,
}: {
  label: string;
  connection: Connection<R>;
  hello: Effect.Effect<string, unknown, R>;
}) {
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
      const exit = yield* hello.pipe(
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
    <section className="mt-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      <p className="mt-1" role="status" aria-live="polite">
        {connection.status === 'error'
          ? 'Could not connect. Reload to try again.'
          : greeting}
      </p>
      <Button
        type="button"
        className="mt-3"
        disabled={connection.status !== 'ready' || pending}
        onClick={() => setAttempt((value) => value + 1)}
      >
        Refresh
      </Button>
    </section>
  );
}
