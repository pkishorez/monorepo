import { Effect } from 'effect';
import type { Duration, Layer } from 'effect';

import type {
  ArmMeta,
  BlockMeta,
  DecisionValue,
  StoryGroupMeta,
  StoryMeta,
  TerminalMeta,
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
  readonly selector: () => AnyEffect;
  readonly arms: Array<{
    readonly kind: 'literal' | 'otherwise';
    readonly value?: DecisionValue;
    readonly body: (value: DecisionValue) => AnyEffect;
  }>;
}

class DecisionBuilderImpl {
  constructor(private readonly state: DecisionState) {}

  when(
    value: DecisionValue,
    meta: ArmMeta,
    body: (value: DecisionValue) => AnyEffect,
  ): DecisionBuilderImpl {
    requireDecisionArmValue(value);
    requireDescription(
      meta.description,
      `Decision Arm "${meta.name ?? value}"`,
    );
    this.state.arms.push({ kind: 'literal', value, body });
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
    this.state.arms.push({ kind: 'otherwise', body });
    return this.run(false);
  }

  exhaustive(): AnyEffect {
    return this.run(true);
  }

  [Symbol.iterator](): Effect.EffectIterator<AnyEffect> {
    return this.run(false)[Symbol.iterator]();
  }

  private run(exhaustive: boolean): AnyEffect {
    const state = this.state;
    return Effect.gen(function* () {
      const input = yield* Effect.suspend(state.selector);
      const selected =
        state.arms.find(
          (arm) => arm.kind === 'literal' && arm.value === input,
        ) ?? state.arms.find((arm) => arm.kind === 'otherwise');
      if (selected !== undefined) return yield* selected.body(input);
      return exhaustive
        ? yield* Effect.die(
            new Error(`Unexpected decision value: ${String(input)}`),
          )
        : undefined;
    });
  }
}

/** Marks a reusable, traversable Effect-returning function boundary. */
export function flow<Args extends readonly unknown[], A, E, R>(
  name: string,
  meta: BlockMeta<Args>,
  fn: (...args: Args) => Effect.Effect<A, E, R>,
): (...args: Args) => Effect.Effect<A, E, R>;
export function flow<A, E, R>(
  name: string,
  meta: BlockMeta,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R>;
export function flow<Args extends readonly unknown[], A, E, R>(
  name: string,
  meta: BlockMeta<Args>,
  input: Effect.Effect<A, E, R> | ((...args: Args) => Effect.Effect<A, E, R>),
): Effect.Effect<A, E, R> | ((...args: Args) => Effect.Effect<A, E, R>) {
  requireDescription(meta.description, `Flow "${name}"`);
  return typeof input === 'function' ? input : input;
}

/** Marks one opaque operation. */
export function step<A, E, R>(
  name: string,
  meta: BlockMeta,
  effect: () => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R>;

export function step<A, E, R>(
  name: string,
  meta: BlockMeta,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R>;
export function step<A, E, R>(
  name: string,
  meta: BlockMeta,
  effect: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>),
): Effect.Effect<A, E, R> {
  requireDescription(meta.description, `Step "${name}"`);
  return Effect.suspend(() =>
    typeof effect === 'function' ? effect() : effect,
  );
}

/** Marks one opaque operation as the end of its local Story branch. */
export function terminal<A, E, R>(
  name: string,
  meta: TerminalMeta,
  effect: () => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R>;
export function terminal<A, E, R>(
  name: string,
  meta: TerminalMeta,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R>;
export function terminal<A, E, R>(
  name: string,
  meta: TerminalMeta,
  effect: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>),
): Effect.Effect<A, E, R> {
  requireDescription(meta.description, `Terminal "${name}"`);
  requireTerminalCompletion(meta);
  return Effect.suspend(() =>
    typeof effect === 'function' ? effect() : effect,
  );
}

/** Builds a lazy, literal-keyed Effect Decision. */
export function decision<const Input extends DecisionValue, E, R>(
  name: string,
  meta: BlockMeta<[Input]>,
  selector: () => Effect.Effect<Input, E, R>,
): DecisionBuilder<Input, never, E, R>;
export function decision<const Input extends DecisionValue>(
  name: string,
  meta: BlockMeta<[Input]>,
  selector: Input,
): DecisionBuilder<Input, never, never, never>;
export function decision<const Input extends DecisionValue, E, R>(
  name: string,
  meta: BlockMeta<[Input]>,
  selector: Input | (() => Effect.Effect<Input, E, R>),
): DecisionBuilder<Input, never, E, R> {
  requireDescription(meta.description, `Decision "${name}"`);
  return new DecisionBuilderImpl({
    selector:
      typeof selector === 'function'
        ? selector
        : () => Effect.succeed(selector),
    arms: [],
  }) as unknown as DecisionBuilder<Input, never, E, R>;
}

export function omit<A, E, R>(
  body: () => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R>;
export function omit<A, E, R>(
  label: string,
  body: () => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R>;
export function omit<A, E, R>(
  labelOrBody: string | (() => Effect.Effect<A, E, R>),
  body?: () => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const operation = typeof labelOrBody === 'function' ? labelOrBody : body!;
  return Effect.suspend(operation);
}

export const all: typeof Effect.all = Effect.all;
export const forEach: typeof Effect.forEach = Effect.forEach;

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

function requireDecisionArmValue(value: DecisionValue): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Decision Arm numeric values must be finite');
  }
}

function requireTerminalCompletion(meta: TerminalMeta): void {
  if (
    meta.completion?.kind === 'error' &&
    meta.completion.error !== undefined &&
    meta.completion.error.trim().length === 0
  ) {
    throw new TypeError('Terminal error name must not be empty');
  }
}

export type {
  Attributes,
  TerminalCompletion,
  TerminalMeta,
} from '../core/types.js';
