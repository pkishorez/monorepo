import {
  Cause,
  Context,
  Duration,
  Effect,
  Exit,
  References,
  Scope,
} from 'effect';
import {
  makeTraceRecorder,
  type CapturedSpan,
  type CapturedTrace,
} from '@kstackz/effect-tracer/recorder';

import { makeBrowser, type Browser, type BrowserHost } from './browser.js';
import type { PhaseName, Venue } from './schema/index.js';

export class ProofContext extends Context.Service<
  ProofContext,
  {
    readonly assert: (
      description: string,
      passed: boolean,
    ) => Effect.Effect<void>;
    /** Every span recorded so far in this Proof run. */
    readonly spans: () => readonly CapturedSpan[];
  }
>()('laymos/ProofContext') {}

export type Phase<A> = Effect.Effect<A, unknown, ProofContext | Scope.Scope>;

/** How a phase ended, as plain data that any copy of `effect` can read. */
export type PhaseOutcome =
  | { readonly _tag: 'Success'; readonly value: unknown }
  | { readonly _tag: 'Failure'; readonly error: string };

/** The runner's side of a Proof run: plain callbacks, never Effects. */
export interface ProofHost {
  readonly trace: (snapshot: () => CapturedTrace) => void;
  readonly enter: (phase: PhaseName) => void;
  readonly assert: (description: string, passed: boolean) => void;
  readonly exit: (phase: PhaseName, outcome: PhaseOutcome) => void;
  readonly browser: BrowserHost | null;
}

export interface Proof {
  readonly _tag: 'Proof';
  readonly title: string;
  readonly description: string | null;
  readonly venue: Venue;
  readonly critical: boolean;
  /** Milliseconds this Proof may run; `null` takes the Venue's default. */
  readonly timeout: number | null;
  /** Browser Venue only: runs in the page and mounts what the Proof exercises into `root`. */
  readonly page: ((root: HTMLElement) => void | (() => void)) | null;
  /**
   * Runs the three phases on the copy of `effect` that built them. The runner
   * loads Proofs with their own copy, and fibers from two copies must not
   * mix: each copy numbers its fibers from zero, so a scope closed by a fiber
   * of one copy can skip interrupting a fiber of the other with the same id.
   */
  readonly run: (host: ProofHost, signal: AbortSignal) => Promise<void>;
}

interface Definition<S, O> {
  readonly title: string;
  readonly description?: string;
  readonly critical?: boolean;
  readonly timeout?: Duration.Input;
  readonly act: (state: S) => Phase<O>;
  readonly verify: (output: O, state: S) => Phase<void>;
}

export const Proof = {
  make<S, O>(
    definition: Definition<S, O> & { readonly prepare: Phase<S> },
  ): Proof {
    return makeProof(definition, 'process', null, () => definition.prepare);
  },

  browser<S, O>(
    definition: Definition<S, O> & {
      readonly page: (root: HTMLElement) => void | (() => void);
      readonly prepare: (browser: Browser) => Phase<S>;
    },
  ): Proof {
    return makeProof(definition, 'browser', definition.page, (host) => {
      if (host.browser === null) {
        return Effect.die(new Error('A browser Proof needs the Browser Venue'));
      }
      return definition.prepare(makeBrowser(host.browser));
    });
  },

  assert(
    description: string,
    passed: boolean,
  ): Effect.Effect<void, never, ProofContext> {
    return Effect.flatMap(ProofContext, (context) =>
      context.assert(description, passed),
    );
  },

  /** Asserts every span named `span` recorded so far ended within `max`. A missing span is a false assertion. */
  budget(
    span: string,
    max: Duration.Input,
  ): Effect.Effect<void, never, ProofContext> {
    return Effect.flatMap(ProofContext, (context) => {
      const limit = Duration.toMillis(max);
      const durations = context
        .spans()
        .filter(({ name }) => name === span)
        .map(({ startTime, endTime }) =>
          endTime === null ? Infinity : endTime - startTime,
        );
      const slowest = Math.max(...durations);
      const measured =
        durations.length === 0
          ? 'none recorded'
          : `slowest ${Number.isFinite(slowest) ? `${slowest.toFixed(1)}ms` : 'never ended'}`;
      return context.assert(
        `every "${span}" span ended within ${limit}ms (${measured})`,
        durations.length > 0 && slowest <= limit,
      );
    });
  },
};

function makeProof<S, O>(
  definition: Definition<S, O>,
  venue: Venue,
  page: Proof['page'],
  prepare: (host: ProofHost) => Phase<S>,
): Proof {
  return {
    _tag: 'Proof',
    title: definition.title,
    description: definition.description ?? null,
    venue,
    critical: definition.critical ?? false,
    timeout:
      definition.timeout === undefined
        ? null
        : Duration.toMillis(definition.timeout),
    page,
    run: (host, signal) =>
      Effect.runPromise(
        runPhases(host, prepare(host), definition.act, definition.verify),
        { signal },
      ),
  };
}

function runPhases<S, O>(
  host: ProofHost,
  prepare: Phase<S>,
  act: (state: S) => Phase<O>,
  verify: (output: O, state: S) => Phase<void>,
): Effect.Effect<void> {
  const recorder = makeTraceRecorder();
  host.trace(recorder.snapshot);
  const failed = new Set<PhaseName>();
  let current: PhaseName = 'prepare';

  const context = ProofContext.of({
    assert: (description, passed) =>
      Effect.sync(() => {
        if (!passed) failed.add(current);
        host.assert(description, passed);
      }),
    spans: () => recorder.snapshot().spans,
  });

  const phase = <A>(name: PhaseName, effect: Phase<A>) =>
    Effect.gen(function* () {
      current = name;
      host.enter(name);
      const exit = yield* Effect.exit(effect.pipe(Effect.withSpan(name)));
      if (Exit.isFailure(exit)) {
        host.exit(name, { _tag: 'Failure', error: Cause.pretty(exit.cause) });
        return { reached: false } as const;
      }
      host.exit(name, { _tag: 'Success', value: exit.value });
      return failed.has(name)
        ? ({ reached: false } as const)
        : ({ reached: true, value: exit.value } as const);
    });

  return Effect.gen(function* () {
    const state = yield* phase('prepare', prepare);
    if (!state.reached) return;
    const output = yield* phase('act', act(state.value));
    if (!output.reached) return;
    yield* phase('verify', verify(output.value, state.value));
  }).pipe(
    Effect.scoped,
    Effect.withSpan('Proof'),
    Effect.provideService(ProofContext, context),
    recorder.instrument,
    // A Proof must see the same logging whatever host runs it.
    Effect.provideService(References.MinimumLogLevel, 'Info'),
  );
}

export function isProof(value: unknown): value is Proof {
  if (typeof value !== 'object' || value === null) return false;
  const proof = value as Proof;
  return (
    proof._tag === 'Proof' &&
    typeof proof.title === 'string' &&
    (proof.venue === 'process' || proof.venue === 'browser') &&
    typeof proof.run === 'function'
  );
}
