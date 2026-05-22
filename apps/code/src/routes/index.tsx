import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Cause, Effect, Fiber, Stream } from 'effect';
import { CodeClient, codeRuntime } from './internal/effect';
import type { HelloMessage } from '@/domain/hello';

function HomePage() {
  const [hello, setHello] = useState<HelloMessage | null>(null);
  const [streamMessages, setStreamMessages] = useState<HelloMessage[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  );

  useEffect(() => {
    setStatus('loading');

    const program = Effect.gen(function* () {
      const { client } = yield* CodeClient;

      const result = yield* client.getHello();
      setHello(result);

      yield* client
        .streamHello()
        .pipe(
          Stream.runForEach((msg) =>
            Effect.sync(() => setStreamMessages((prev) => [...prev, msg])),
          ),
        );
    });

    const fiber = codeRuntime.runFork(program);

    fiber.addObserver((exit) => {
      if (exit._tag === 'Success') setStatus('done');
      else if (Cause.isInterruptedOnly(exit.cause)) setStatus('idle');
      else {
        setStatus('error');
        console.error('RPC error:', exit.cause);
      }
    });

    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-lg space-y-8 p-8">
        <h1 className="text-3xl font-bold">code</h1>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Normal RPC</h2>
          <div className="rounded-lg border p-4">
            {hello ? (
              <p>{hello.message}</p>
            ) : (
              <p className="text-muted-foreground">Loading...</p>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Streaming RPC</h2>
          <div className="rounded-lg border p-4">
            {streamMessages.length === 0 && status === 'loading' && (
              <p className="text-muted-foreground">Waiting for stream...</p>
            )}
            <ul className="space-y-1">
              {streamMessages.map((msg, i) => (
                <li key={i}>{msg.message}</li>
              ))}
            </ul>
            {status === 'done' && (
              <p className="mt-2 text-sm text-muted-foreground">
                Stream complete
              </p>
            )}
            {status === 'error' && (
              <p className="mt-2 text-sm text-red-500">Stream error</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/')({
  component: HomePage,
});
