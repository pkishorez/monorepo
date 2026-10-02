import {
  Cause,
  Context,
  Duration,
  Effect,
  Exit,
  Logger,
  References,
} from 'effect';
import { makeTraceRecorder } from '@kstackz/effect-tracer/recorder';
import { FlowTelemetry } from '@kstackz/flow';

import type { QuestionSection } from './schema/index.js';

export class StoryContext extends Context.Service<
  StoryContext,
  {
    readonly beginSection: (section: QuestionSection) => Effect.Effect<void>;
    readonly assert: (
      description: string,
      passed: boolean,
    ) => Effect.Effect<void>;
  }
>()('StoryContext') {}

/** Where a running proof reports its sections and assertions. */
export interface ProofReporter {
  readonly beginSection: (section: QuestionSection) => void;
  readonly assert: (description: string, passed: boolean) => void;
}

/** How a proof ended, as plain data that any copy of `effect` can read. */
export type ProofOutcome =
  | { readonly _tag: 'Success'; readonly value: unknown }
  | { readonly _tag: 'Failure'; readonly error: string };

export interface StoryQuestion {
  readonly question: string;
  readonly answer: string;
  readonly proof: Effect.Effect<unknown, unknown, StoryContext>;
  /**
   * Runs `proof` on the copy of `effect` that built it. The runner loads
   * Stories with their own copy, and fibers from two copies must not mix:
   * each copy numbers its fibers from zero, so a scope closed by a fiber of
   * one copy can skip interrupting a fiber of the other with the same id.
   */
  readonly run: (
    reporter: ProofReporter,
    signal: AbortSignal,
  ) => Promise<ProofOutcome>;
}

export interface Story {
  readonly title: string;
  readonly description: string;
  readonly spine: boolean;
  readonly sourceUrl: string;
  readonly questions: readonly StoryQuestion[];
  /** How long this Story may run before it is failed; overrides the config-wide Story timeout. */
  readonly timeout?: Duration.Input;
}

export interface StoryGroup {
  readonly title: string;
  readonly description: string;
  readonly children: readonly StoryNode[];
}

export type StoryNode = Story | StoryGroup;

export const Story = {
  make(story: Omit<Story, 'spine'> & { readonly spine?: boolean }): Story {
    return { ...story, spine: story.spine ?? false };
  },

  question(
    question: string,
    options: {
      readonly answer: string;
      readonly proof: Effect.Effect<unknown, unknown, StoryContext>;
    },
  ): StoryQuestion {
    return {
      question,
      answer: options.answer,
      proof: options.proof,
      run: (reporter, signal) => runProof(options.proof, reporter, signal),
    };
  },

  group(
    title: string,
    options: { readonly description: string },
    children: readonly StoryNode[],
  ): StoryGroup {
    return { title, description: options.description, children };
  },

  trace<A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R | StoryContext> {
    return Effect.gen(function* () {
      const context = yield* StoryContext;
      const recorder = makeTraceRecorder();
      return yield* recorder
        .instrument(effect)
        .pipe(
          Effect.onExit(() =>
            context.beginSection({ kind: 'trace', trace: recorder.snapshot() }),
          ),
        );
    });
  },

  flow<A, E, R>(
    effect: Effect.Effect<A, E, R>,
    _options?: { readonly mergeRelated?: boolean },
  ): Effect.Effect<A, E, R | StoryContext> {
    return Effect.gen(function* () {
      const context = yield* StoryContext;
      const sink = FlowTelemetry.makeMemory();
      return yield* effect.pipe(
        Effect.provideService(FlowTelemetry, sink),
        Effect.onExit(() =>
          Effect.forEach(sink.journals(), (journal) =>
            context.beginSection({ kind: 'flow', journal }),
          ),
        ),
      );
    });
  },

  assert(
    description: string,
    passed: boolean,
  ): Effect.Effect<void, never, StoryContext> {
    return Effect.flatMap(StoryContext, (context) =>
      context.assert(description, passed),
    );
  },
};

function runProof(
  proof: Effect.Effect<unknown, unknown, StoryContext>,
  reporter: ProofReporter,
  signal: AbortSignal,
): Promise<ProofOutcome> {
  return Effect.runPromise(
    proof.pipe(
      Effect.provideService(StoryContext, {
        beginSection: (section) =>
          Effect.sync(() => reporter.beginSection(section)),
        assert: (description, passed) =>
          Effect.sync(() => reporter.assert(description, passed)),
      }),
      // A proof must see the same logging whatever host runs it: a Story
      // that captures its own logs cannot depend on the host's log level.
      Effect.provideService(References.MinimumLogLevel, 'Info'),
      Effect.provide(Logger.layer([])),
      Effect.exit,
      Effect.map((exit): ProofOutcome =>
        Exit.isSuccess(exit)
          ? { _tag: 'Success', value: exit.value }
          : { _tag: 'Failure', error: Cause.pretty(exit.cause) },
      ),
    ),
    { signal },
  );
}

export function isStory(value: unknown): value is Story {
  if (typeof value !== 'object' || value === null) return false;
  const story = value as Story;
  return (
    typeof story.title === 'string' &&
    typeof story.description === 'string' &&
    typeof story.spine === 'boolean' &&
    typeof story.sourceUrl === 'string' &&
    Array.isArray(story.questions) &&
    story.questions.every(
      (question) =>
        typeof question.question === 'string' &&
        typeof question.answer === 'string' &&
        Effect.isEffect(question.proof) &&
        typeof question.run === 'function',
    )
  );
}

export function isStoryGroup(value: unknown): value is StoryGroup {
  if (typeof value !== 'object' || value === null) return false;
  const group = value as StoryGroup;
  if (
    typeof group.title !== 'string' ||
    typeof group.description !== 'string' ||
    !Array.isArray(group.children)
  ) {
    return false;
  }
  return group.children.every((child) => isStory(child) || isStoryGroup(child));
}
