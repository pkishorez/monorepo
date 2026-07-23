import { Effect, Pipeable } from 'effect';
import type { Duration, Layer } from 'effect';

import type {
  ArmMeta,
  BlockMeta,
  DecisionValue,
  OmissionMeta,
  StoryGroupMeta,
  StoryMeta,
  TerminalMeta,
} from '../core/types.js';
import type { TerminalCompletion } from '../core/types.js';

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

declare const DecisionMatcherTypeId: unique symbol;

export interface DecisionMatcher<
  Input extends DecisionValue,
  Remaining extends DecisionValue,
  A,
  E,
  R,
>
  extends Pipeable.Pipeable {
  readonly [DecisionMatcherTypeId]: {
    readonly input: Input;
    readonly remaining: Remaining;
    readonly success: A;
    readonly error: E;
    readonly services: R;
  };
}

interface DecisionState {
  readonly value: DecisionValue;
  readonly arms: Array<{
    readonly kind: 'literal' | 'otherwise';
    readonly value?: DecisionValue;
    readonly body: () => AnyEffect;
  }>;
}

class DecisionMatcherImpl {
  constructor(private readonly state: DecisionState) {}

  pipe(): unknown {
    return Pipeable.pipeArguments(this, arguments);
  }

  addWhen(
    value: DecisionValue,
    meta: ArmMeta,
    body: () => AnyEffect,
  ): DecisionMatcherImpl {
    requireDecisionArmValue(value);
    requireDescription(
      meta.description,
      `Decision Arm "${meta.name ?? value}"`,
    );
    armOutcome(meta);
    this.state.arms.push({ kind: 'literal', value, body });
    return this;
  }

  addOrElse(meta: ArmMeta, body: () => AnyEffect): DecisionMatcherImpl {
    requireDescription(
      meta.description,
      `Decision Arm "${meta.name ?? 'Otherwise'}"`,
    );
    armOutcome(meta);
    this.state.arms.push({ kind: 'otherwise', body });
    return this;
  }

  run(exhaustive: boolean): AnyEffect {
    const state = this.state;
    const selected =
      state.arms.find(
        (arm) => arm.kind === 'literal' && arm.value === state.value,
      ) ?? state.arms.find((arm) => arm.kind === 'otherwise');
    if (selected !== undefined) return selected.body();
    return exhaustive
      ? Effect.die(
          new Error(`Unexpected decision value: ${String(state.value)}`),
        )
      : Effect.void;
  }
}

/** Marks a reusable, traversable Effect-returning function boundary. */
export function flow<Args extends readonly unknown[], A, E, R>(
  name: string,
  meta: BlockMeta<Args>,
  fn: (...args: Args) => Effect.Effect<A, E, R>,
): (...args: Args) => Effect.Effect<A, E, R>;
export function flow<Args extends readonly unknown[], A, E, R>(
  name: string,
  meta: BlockMeta<Args>,
  input: (...args: Args) => Effect.Effect<A, E, R>,
): (...args: Args) => Effect.Effect<A, E, R> {
  requireDescription(meta.description, `Flow "${name}"`);
  return input;
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
  effect: () => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  requireDescription(meta.description, `Step "${name}"`);
  return effect();
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
  effect: () => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  requireDescription(meta.description, `Terminal "${name}"`);
  requireTerminalCompletion(meta);
  return effect();
}

/** Starts a narrated matcher for an already-computed value. */
export function decision<const Input extends DecisionValue>(
  name: string,
  meta: BlockMeta<[Input]>,
  value: Input,
): DecisionMatcher<Input, Input, never, never, never> {
  requireDescription(meta.description, `Decision "${name}"`);
  requireDecisionArmValue(value);
  return new DecisionMatcherImpl({
    value,
    arms: [],
  }) as unknown as DecisionMatcher<Input, Input, never, never, never>;
}

export function when<
  const Pattern extends DecisionValue,
  Next extends AnyEffect,
>(
  pattern: Pattern,
  meta: ArmMeta,
  body: () => Next,
): <Input extends DecisionValue, Remaining extends DecisionValue, A, E, R>(
  matcher: DecisionMatcher<Input, Remaining, A, E, R> &
    (Pattern extends Remaining ? unknown : never),
) => DecisionMatcher<
  Input,
  Exclude<Remaining, Pattern>,
  A | Success<Next>,
  E | Error<Next>,
  R | Services<Next>
> {
  return ((matcher: DecisionMatcherImpl) =>
    matcher.addWhen(pattern, meta, body)) as never;
}

type HasOpenRemainder<Remaining extends DecisionValue> =
  string extends Remaining ? true : number extends Remaining ? true : false;

export function orElse<Next extends AnyEffect>(
  meta: ArmMeta,
  body: () => Next,
): <Input extends DecisionValue, Remaining extends DecisionValue, A, E, R>(
  matcher: HasOpenRemainder<Remaining> extends true
    ? DecisionMatcher<Input, Remaining, A, E, R>
    : never,
) => Effect.Effect<A | Success<Next>, E | Error<Next>, R | Services<Next>> {
  return ((matcher: DecisionMatcherImpl) =>
    matcher.addOrElse(meta, body).run(false)) as never;
}

export const exhaustive = <Input extends DecisionValue, A, E, R>(
  matcher: DecisionMatcher<Input, never, A, E, R>,
): Effect.Effect<A, E, R> =>
  (matcher as unknown as DecisionMatcherImpl).run(true);

export function omit<A, E, R>(
  meta: OmissionMeta,
  body: () => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  requireReason(meta.reason);
  return body();
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
  if (meta.completion === undefined) {
    throw new TypeError('Terminal completion is required');
  }
  if (
    meta.completion.kind === 'error' &&
    (typeof meta.completion.error !== 'string' ||
      meta.completion.error.trim().length === 0)
  ) {
    throw new TypeError('Terminal error name must not be empty');
  }
}

function armOutcome(meta: ArmMeta): {
  readonly errors?: readonly string[];
  readonly completion?: TerminalCompletion;
} {
  if (meta.errors !== undefined && meta.completion !== undefined) {
    throw new TypeError(
      'Decision Arm cannot declare both errors and completion',
    );
  }
  if (meta.errors !== undefined) {
    if (
      meta.errors.length === 0 ||
      new Set(meta.errors).size !== meta.errors.length ||
      meta.errors.some(
        (error) => typeof error !== 'string' || error.trim().length === 0,
      )
    ) {
      throw new TypeError(
        'Decision Arm errors must be unique, non-empty names',
      );
    }
    return { errors: meta.errors };
  }
  if (meta.completion !== undefined) {
    if (
      meta.completion.kind === 'error' &&
      (typeof meta.completion.error !== 'string' ||
        meta.completion.error.trim().length === 0)
    ) {
      throw new TypeError('Decision Arm error completion must name an error');
    }
    return { completion: meta.completion };
  }
  return {};
}

function requireReason(reason: string): void {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new TypeError('Omission reason must not be empty');
  }
}

export type {
  Attributes,
  OmissionMeta,
  TerminalCompletion,
  TerminalMeta,
} from '../core/types.js';
