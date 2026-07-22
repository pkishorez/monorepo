import { Effect } from 'effect';
import type { Duration, Layer } from 'effect';

import type {
  ArmMeta,
  BlockMeta,
  DecisionValue,
  StoryGroupMeta,
  StoryMeta,
} from '../core/types.js';

export interface ScenarioMeta {
  readonly description: string;
  readonly timeout?: Duration.Input;
}

export interface EffectVerifiedScenario<Prepared, R> {
  cleanup<E>(
    cleanup: (prepared: Prepared) => Effect.Effect<unknown, E, R>,
  ): EffectVerifiedScenario<Prepared, R>;
}

export interface EffectPreparedScenario<Prepared, Output, Error, R> {
  cleanup<CleanupError>(
    cleanup: (prepared: Prepared) => Effect.Effect<unknown, CleanupError, R>,
  ): EffectPreparedScenario<Prepared, Output, Error, R>;
  verify<VerificationError>(
    verify: (
      output: Output,
      prepared: Prepared,
    ) => Effect.Effect<unknown, VerificationError, R>,
  ): EffectVerifiedScenario<Prepared, R>;
  verifyError<VerificationError>(
    verify: (
      error: Error,
      prepared: Prepared,
    ) => Effect.Effect<unknown, VerificationError, R>,
  ): EffectVerifiedScenario<Prepared, R>;
}

export interface EffectScenario<Prepared, Output, Error, R> {
  prepare<PreparationError>(
    prepare: () => Effect.Effect<Prepared, PreparationError, R>,
  ): EffectPreparedScenario<Prepared, Output, Error, R>;
}

export interface EffectStory<Prepared, Output, Error, R> {
  scenario(
    name: string,
    meta: ScenarioMeta,
    define: (
      scenario: EffectScenario<Prepared, Output, Error, R>,
    ) => EffectVerifiedScenario<Prepared, R>,
  ): EffectStory<Prepared, Output, Error, R>;
  skip(
    name: string,
    meta: ScenarioMeta,
  ): EffectStory<Prepared, Output, Error, R>;
}

export interface EffectStoryBuilder<R> {
  provide<Services, LayerError>(
    layer: Layer.Layer<Services, LayerError, never>,
  ): EffectStoryBuilder<Services>;
  execute<Prepared, Output, Error>(
    execute: (prepared: Prepared) => Effect.Effect<Output, Error, R>,
  ): EffectStory<Prepared, Output, Error, R>;
}

export interface EffectStoryGroup {
  group(name: string, meta: StoryGroupMeta): EffectStoryGroup;
  story(name: string, meta: StoryMeta): EffectStoryBuilder<never>;
}

const inertStory: EffectStory<unknown, unknown, unknown, unknown> = {
  scenario(_name, meta) {
    requireDescription(meta.description, `Scenario "${_name}"`);
    return inertStory;
  },
  skip(_name, meta) {
    requireDescription(meta.description, `Scenario "${_name}"`);
    return inertStory;
  },
};

const inertStoryBuilder = {
  provide() {
    return inertStoryBuilder;
  },
  execute() {
    return inertStory;
  },
};

/** Declares a Story when loaded by the Laymos Story runner. */
export function story(
  name: string,
  meta: StoryMeta,
): EffectStoryBuilder<never> {
  requirePathSegment(name, 'Story');
  requireDescription(meta.description, `Story "${name}"`);
  return inertStoryBuilder as unknown as EffectStoryBuilder<never>;
}

/** Declares a reusable Story Group. */
export function storyGroup(
  name: string,
  meta: StoryGroupMeta,
): EffectStoryGroup {
  requirePathSegment(name, 'Story Group');
  requireDescription(meta.description, `Story Group "${name}"`);
  return inertStoryGroup;
}

const inertStoryGroup: EffectStoryGroup = {
  group(name, meta) {
    requirePathSegment(name, 'Story Group');
    requireDescription(meta.description, `Story Group "${name}"`);
    return inertStoryGroup;
  },
  story,
};

type AnyEffect = Effect.Effect<any, any, any>;
type Success<T> = T extends Effect.Effect<infer A, any, any> ? A : never;
type Error<T> = T extends Effect.Effect<any, infer E, any> ? E : never;
type Services<T> = T extends Effect.Effect<any, any, infer R> ? R : never;

export interface DecisionBuilder<Remaining extends DecisionValue, A, E, R> {
  when<Key extends Remaining, Next extends AnyEffect>(
    value: Key,
    meta: ArmMeta,
    body: (value: Key) => Next,
  ): DecisionBuilder<
    Exclude<Remaining, Key>,
    A | Success<Next>,
    E | Error<Next>,
    R | Services<Next>
  >;
  otherwise<Next extends AnyEffect>(
    meta: ArmMeta,
    body: (value: Remaining) => Next,
  ): Effect.Effect<A | Success<Next>, E | Error<Next>, R | Services<Next>>;
  readonly exhaustive: [Remaining] extends [never]
    ? () => Effect.Effect<A, E, R>
    : never;
  [Symbol.iterator](): Effect.EffectIterator<Effect.Effect<A, E, R>>;
}

interface DecisionState {
  readonly input: DecisionValue;
  matched: boolean;
  selected: AnyEffect;
}

class DecisionBuilderImpl {
  constructor(private readonly state: DecisionState) {}

  when(
    value: DecisionValue,
    meta: ArmMeta,
    body: (value: DecisionValue) => AnyEffect,
  ): DecisionBuilderImpl {
    requireDescription(
      meta.description,
      `Decision Arm "${meta.name ?? value}"`,
    );
    if (!this.state.matched && Object.is(this.state.input, value)) {
      this.state.matched = true;
      this.state.selected = body(value);
    }
    return this;
  }

  otherwise(
    meta: ArmMeta,
    body: (value: DecisionValue) => AnyEffect,
  ): AnyEffect {
    requireDescription(
      meta.description,
      `Decision Arm "${meta.name ?? 'Otherwise'}"`,
    );
    if (!this.state.matched) {
      this.state.matched = true;
      this.state.selected = body(this.state.input);
    }
    return this.state.selected;
  }

  exhaustive(): AnyEffect {
    return this.state.selected;
  }

  [Symbol.iterator](): Effect.EffectIterator<AnyEffect> {
    return this.state.selected[Symbol.iterator]();
  }
}

/** Marks a reusable Effect-returning function boundary as a Story Block. */
export function functionBlock<Args extends readonly unknown[], A, E, R>(
  name: string,
  meta: BlockMeta<Args>,
  fn: (...args: Args) => Effect.Effect<A, E, R>,
): (...args: Args) => Effect.Effect<A, E, R> {
  requireDescription(meta.description, `Block "${name}"`);
  return fn;
}

/** Wraps an Effect in an inline Story Block. */
export function step<A, E, R>(
  name: string,
  meta: BlockMeta,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  requireDescription(meta.description, `Block "${name}"`);
  return effect;
}

/** Builds an eager, literal-keyed Effect Decision. */
export function decision<const Input extends DecisionValue>(
  name: string,
  meta: BlockMeta<[Input]>,
  input: Input,
): DecisionBuilder<Input, never, never, never> {
  requireDescription(meta.description, `Decision "${name}"`);
  return new DecisionBuilderImpl({
    input,
    matched: false,
    selected: Effect.void,
  }) as unknown as DecisionBuilder<Input, never, never, never>;
}

function requireDescription(description: string, subject: string): void {
  if (description.trim().length === 0) {
    throw new TypeError(`${subject} description must not be empty`);
  }
}

function requirePathSegment(name: string, subject: string): void {
  if (name.trim().length === 0) {
    throw new TypeError(`${subject} name must not be empty`);
  }
  if (name.includes('/')) {
    throw new TypeError(`${subject} name "${name}" must not contain "/"`);
  }
}

export type { Attributes } from '../core/types.js';
