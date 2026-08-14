import { Context, Effect } from 'effect';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';

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

export interface StoryQuestion {
  readonly question: string;
  readonly answer: string;
  readonly proof: Effect.Effect<unknown, unknown, StoryContext>;
}

export interface Story {
  readonly title: string;
  readonly sourceUrl: string;
  readonly questions: readonly StoryQuestion[];
}

export interface StoryGroup {
  readonly title: string;
  readonly children: readonly StoryNode[];
}

export type StoryNode = Story | StoryGroup;

export const Story = {
  make(story: Story): Story {
    return story;
  },

  question(
    question: string,
    options: {
      readonly answer: string;
      readonly proof: Effect.Effect<unknown, unknown, StoryContext>;
    },
  ): StoryQuestion {
    return { question, answer: options.answer, proof: options.proof };
  },

  group(title: string, children: readonly StoryNode[]): StoryGroup {
    return { title, children };
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
  ): Effect.Effect<A, E, R | StoryContext> {
    return Effect.gen(function* () {
      const context = yield* StoryContext;
      const recorder = makeTraceRecorder();
      return yield* recorder
        .instrument(effect)
        .pipe(
          Effect.onExit(() =>
            Effect.forEach(recorder.snapshotFlows(), (flow) =>
              context.beginSection({ kind: 'flow', flow }),
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

export function isStory(value: unknown): value is Story {
  if (typeof value !== 'object' || value === null) return false;
  const story = value as Story;
  return (
    typeof story.title === 'string' &&
    typeof story.sourceUrl === 'string' &&
    Array.isArray(story.questions) &&
    story.questions.every(
      (question) =>
        typeof question.question === 'string' &&
        typeof question.answer === 'string' &&
        Effect.isEffect(question.proof),
    )
  );
}

export function isStoryGroup(value: unknown): value is StoryGroup {
  if (typeof value !== 'object' || value === null) return false;
  const group = value as StoryGroup;
  if (typeof group.title !== 'string' || !Array.isArray(group.children)) {
    return false;
  }
  return group.children.every((child) => isStory(child) || isStoryGroup(child));
}
