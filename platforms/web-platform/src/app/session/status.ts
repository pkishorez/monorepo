import { Effect, SubscriptionRef } from 'effect';

/**
 * Whether the open Account has been confirmed by its Sign-in since the
 * Session opened, and when it last was. An Account opened from what the
 * device remembers is `verifying` until the Sign-in answers; a call made
 * meanwhile waits for the token, and nothing fails for being early.
 */
export interface SessionStatus {
  readonly state: 'verifying' | 'verified';
  readonly lastVerifiedAt: Date | null;
}

/** One Session's status: a SubscriptionRef for Effect code, and a plain
 * read and subscription for React. The Gate sets it. */
export interface StatusCell {
  readonly ref: SubscriptionRef.SubscriptionRef<SessionStatus>;
  readonly get: () => SessionStatus;
  readonly subscribe: (changed: () => void) => () => void;
  readonly set: (status: SessionStatus) => void;
}

/** A status cell starting at `initial`. */
export const makeStatus = (initial: SessionStatus): Effect.Effect<StatusCell> =>
  Effect.map(SubscriptionRef.make(initial), (ref) => {
    let current = initial;
    const listeners = new Set<() => void>();
    return {
      ref,
      get: () => current,
      subscribe: (changed) => {
        listeners.add(changed);
        return () => void listeners.delete(changed);
      },
      set: (status) => {
        if (
          status.state === current.state &&
          status.lastVerifiedAt?.getTime() === current.lastVerifiedAt?.getTime()
        )
          return;
        current = status;
        Effect.runSync(SubscriptionRef.set(ref, status));
        listeners.forEach((changed) => changed());
      },
    };
  });
