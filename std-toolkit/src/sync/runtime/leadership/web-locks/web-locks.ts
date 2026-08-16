import { Effect, Layer } from 'effect';
import { LeadershipService, type LeadershipIdentity } from '../leadership.js';

type BrowserLockManager = {
  request: (
    name: string,
    options: { readonly mode: 'exclusive'; readonly signal: AbortSignal },
    callback: (lock: unknown) => Promise<void>,
  ) => Promise<unknown>;
};

type BrowserDocument = {
  readonly visibilityState: string;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

type BrowserGlobals = {
  readonly navigator?: { readonly locks?: BrowserLockManager };
  readonly document?: BrowserDocument;
};

export type WebLockLeadershipOptions = {
  readonly releaseWhen?: 'hidden' | 'frozen';
};

type LifecycleGate = {
  readonly eligible: () => boolean;
  readonly waitFor: (eligible: boolean) => Effect.Effect<void>;
  readonly close: () => void;
};

const makeLifecycleGate = (
  document: BrowserDocument,
  releaseWhen: 'hidden' | 'frozen',
): LifecycleGate => {
  let eligible =
    releaseWhen === 'hidden' ? document.visibilityState !== 'hidden' : true;
  const waiters = new Set<{
    readonly expected: boolean;
    readonly done: () => void;
  }>();

  const setEligible = (next: boolean) => {
    eligible = next;
    for (const waiter of waiters) {
      if (waiter.expected !== next) continue;
      waiters.delete(waiter);
      waiter.done();
    }
  };

  const onVisibilityChange = () =>
    setEligible(document.visibilityState !== 'hidden');
  const onFreeze = () => setEligible(false);
  const onResume = () => setEligible(true);
  const onPageHide = () => setEligible(false);
  const onPageShow = () =>
    setEligible(
      releaseWhen === 'hidden' ? document.visibilityState !== 'hidden' : true,
    );

  if (releaseWhen === 'hidden') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  } else {
    document.addEventListener('freeze', onFreeze);
    document.addEventListener('resume', onResume);
  }
  document.addEventListener('pagehide', onPageHide);
  document.addEventListener('pageshow', onPageShow);

  return {
    eligible: () => eligible,
    waitFor: (expected) =>
      Effect.callback<void>((resume) => {
        if (eligible === expected) {
          resume(Effect.void);
          return;
        }
        const waiter = { expected, done: () => resume(Effect.void) };
        waiters.add(waiter);
        return Effect.sync(() => waiters.delete(waiter));
      }),
    close: () => {
      waiters.clear();
      if (releaseWhen === 'hidden') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      } else {
        document.removeEventListener('freeze', onFreeze);
        document.removeEventListener('resume', onResume);
      }
      document.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('pageshow', onPageShow);
    },
  };
};

const withWebLock = <A, E, R>(
  locks: BrowserLockManager,
  identity: LeadershipIdentity,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.callback<{ readonly release: () => void }>((resume, signal) => {
          let acquired = false;
          let release: () => void = () => {};
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });

          void locks
            .request(identity, { mode: 'exclusive', signal }, async () => {
              acquired = true;
              resume(Effect.succeed({ release }));
              await held;
            })
            .catch((error: unknown) => {
              if (!acquired && !signal.aborted) resume(Effect.die(error));
            });

          return Effect.sync(() => {
            if (acquired) release();
          });
        }),
        (current) => Effect.sync(current.release),
        { interruptible: true },
      );
      return yield* effect;
    }),
  );

const runWithLifecycle = <A, E, R>(
  locks: BrowserLockManager,
  document: BrowserDocument,
  releaseWhen: 'hidden' | 'frozen',
  identity: LeadershipIdentity,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => makeLifecycleGate(document, releaseWhen)),
    (gate) => {
      type Outcome =
        | { readonly _tag: 'Completed'; readonly value: A }
        | { readonly _tag: 'Yielded' };

      const loop: Effect.Effect<A, E, R> = Effect.suspend(() => {
        if (!gate.eligible()) {
          return gate.waitFor(true).pipe(Effect.andThen(loop));
        }

        const completed = withWebLock(locks, identity, effect).pipe(
          Effect.map((value): Outcome => ({ _tag: 'Completed', value })),
        );
        const yielded = gate
          .waitFor(false)
          .pipe(Effect.as<Outcome>({ _tag: 'Yielded' }));
        return Effect.raceFirst(completed, yielded).pipe(
          Effect.flatMap((outcome) =>
            outcome._tag === 'Completed' ? Effect.succeed(outcome.value) : loop,
          ),
        );
      });

      return loop;
    },
    (gate) => Effect.sync(gate.close),
  );

export const webLockLeadership = (options: WebLockLeadershipOptions = {}) => {
  const globals = globalThis as unknown as BrowserGlobals;
  const locks = globals.navigator?.locks;
  const document = globals.document;
  if (!locks || !document) {
    throw new Error(
      '[sync] Web Lock Leadership requires navigator.locks and document',
    );
  }
  const releaseWhen = options.releaseWhen ?? 'hidden';

  return Layer.succeed(LeadershipService, {
    run: (identity, effect) =>
      runWithLifecycle(locks, document, releaseWhen, identity, effect),
  });
};
