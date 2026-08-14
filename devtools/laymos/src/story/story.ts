import { Context, Effect } from 'effect';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';

import type { StorySection } from './schema/index.js';

export type StorySectionStart =
  | Omit<Extract<StorySection, { kind: 'trace' }>, 'assertions'>
  | Omit<Extract<StorySection, { kind: 'flow' }>, 'assertions'>
  | Omit<Extract<StorySection, { kind: 'exec' }>, 'assertions'>;

export class StoryContext extends Context.Service<
  StoryContext,
  {
    readonly beginSection: (section: StorySectionStart) => Effect.Effect<void>;
    readonly assert: (
      description: string,
      passed: boolean,
    ) => Effect.Effect<void>;
  }
>()('StoryContext') {}

export interface Story {
  readonly title: string;
  readonly description: string;
  readonly markdown: string;
  readonly run: Effect.Effect<unknown, unknown, StoryContext>;
}

export interface StoryGroup {
  readonly title: string;
  readonly description: string;
  readonly markdown: string;
  readonly children: readonly StoryGroup[] | readonly Story[];
}

export const Story = {
  make(story: Story): Story {
    return story;
  },

  group(group: StoryGroup): StoryGroup {
    return group;
  },

  trace<A, E, R>(
    description: string,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R | StoryContext> {
    return Effect.gen(function* () {
      const context = yield* StoryContext;
      const recorder = makeTraceRecorder();
      return yield* recorder.instrument(effect).pipe(
        Effect.onExit(() =>
          context.beginSection({
            kind: 'trace',
            description,
            trace: recorder.snapshot(),
          }),
        ),
      );
    });
  },

  flow<A, E, R>(
    description: string,
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
              context.beginSection({ kind: 'flow', description, flow }),
            ),
          ),
        );
    });
  },

  exec<A, E, R>(
    description: string,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R | StoryContext> {
    return Effect.gen(function* () {
      const context = yield* StoryContext;
      return yield* effect.pipe(
        Effect.onExit(() =>
          context.beginSection({ kind: 'exec', description }),
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
    typeof story.description === 'string' &&
    typeof story.markdown === 'string' &&
    Effect.isEffect(story.run)
  );
}

export function isStoryGroup(value: unknown): value is StoryGroup {
  if (typeof value !== 'object' || value === null) return false;
  const group = value as StoryGroup;
  if (
    typeof group.title !== 'string' ||
    typeof group.description !== 'string' ||
    typeof group.markdown !== 'string' ||
    !Array.isArray(group.children)
  ) {
    return false;
  }
  return (
    group.children.every(isStory) ||
    group.children.every((child) => isStoryGroup(child))
  );
}
