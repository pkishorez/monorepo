import { Cause, Effect, Stream, SubscriptionRef } from 'effect';
import { useState } from 'react';
import { useComponentLifecycle, useRunEffect } from 'use-effect-ts';
import type {
  PassReport,
  SessionStatus,
} from '../../../../engine/session/index.ts';
import {
  emptyTranscript,
  type Transcript,
} from '../../../../engine/transcript/index.ts';
import type { ContextPayload } from '../context-buttons/index.ts';
import type { StudioRuntime } from './runtime.ts';
import { StudioSession } from './studio-session.ts';

export interface StudioSessionView {
  readonly status: SessionStatus;
  readonly transcript: Transcript<ContextPayload>;
  readonly passes: ReadonlyArray<PassReport>;
  readonly error: string | null;
  readonly start: () => void;
  readonly stop: () => void;
  readonly inject: (payload: ContextPayload) => void;
  readonly reset: () => void;
}

/** Mirrors the engine session into React state and exposes its actions. */
export function useStudioSession(runtime: StudioRuntime): StudioSessionView {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [transcript, setTranscript] =
    useState<Transcript<ContextPayload>>(emptyTranscript);
  const [passes, setPasses] = useState<ReadonlyArray<PassReport>>([]);
  const [error, setError] = useState<string | null>(null);

  useComponentLifecycle(
    Effect.gen(function* () {
      const context = yield* runtime.contextEffect;
      yield* Effect.gen(function* () {
        const session = yield* StudioSession;
        yield* Effect.all(
          [
            Stream.runForEach(SubscriptionRef.changes(session.status), (next) =>
              Effect.sync(() => setStatus(next)),
            ),
            Stream.runForEach(
              SubscriptionRef.changes(session.transcript),
              (next) => Effect.sync(() => setTranscript(next)),
            ),
            Stream.runForEach(SubscriptionRef.changes(session.passes), (next) =>
              Effect.sync(() => setPasses(next)),
            ),
          ],
          { concurrency: 'unbounded' },
        );
      }).pipe(Effect.provide(context));
    }),
    { deps: [runtime] },
  );

  const run = useRunEffect(
    (
      action: (
        session: StudioSession['Service'],
      ) => Effect.Effect<void, { readonly message: string }>,
    ) =>
      Effect.gen(function* () {
        setError(null);
        const context = yield* runtime.contextEffect;
        yield* Effect.gen(function* () {
          const session = yield* StudioSession;
          yield* action(session);
        }).pipe(Effect.provide(context));
      }).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.sync(() => {
                const failure = Cause.findErrorOption(cause);
                setError(
                  failure._tag === 'Some'
                    ? failure.value.message
                    : Cause.pretty(cause),
                );
              }),
        ),
      ),
  );

  return {
    status,
    transcript,
    passes,
    error,
    start: () => run((session) => session.start),
    stop: () => run((session) => session.stop),
    inject: (payload) => run((session) => session.inject(payload)),
    reset: () => run((session) => session.reset),
  };
}
