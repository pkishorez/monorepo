import { Cause, Context, Effect, Exit } from 'effect';
import type { Duration, Layer } from 'effect';

import {
  addScenario,
  declareStory,
  type MutableStoryDeclaration,
  type ScenarioExpectation,
} from '../core/declare.js';
import {
  captureLocation,
  CurrentRecorder,
  resolveAttributes,
} from '../core/recorder.js';
import type {
  ArmDeclaration,
  BlockDeclaration,
  SelectedArm,
} from '../core/recorder.js';
import type {
  ArmMeta,
  Attributes,
  BlockMeta,
  DecisionValue,
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

/** Declares the single Story owned by a Story file. */
export function story(
  name: string,
  meta: StoryMeta,
): EffectStoryBuilder<never> {
  return new EffectStoryBuilderImpl(declareStory(name, meta));
}

class EffectStoryBuilderImpl implements EffectStoryBuilder<any> {
  constructor(private readonly declaration: MutableStoryDeclaration) {}

  provide<Services, LayerError>(
    layer: Layer.Layer<Services, LayerError, never>,
  ): EffectStoryBuilder<Services> {
    this.declaration.execution = {
      execute: () => Effect.void,
      layer,
    };
    return this as EffectStoryBuilderImpl as EffectStoryBuilder<Services>;
  }

  execute<Prepared, Output, Error>(
    execute: (prepared: Prepared) => Effect.Effect<Output, Error, any>,
  ): EffectStory<Prepared, Output, Error, any> {
    const layer = this.declaration.execution?.layer;
    this.declaration.execution = {
      execute: execute as (prepared: unknown) => unknown,
      ...(layer === undefined ? {} : { layer }),
    };
    return new EffectStoryImpl(this.declaration);
  }
}

class EffectStoryImpl implements EffectStory<any, any, any, any> {
  constructor(private readonly declaration: MutableStoryDeclaration) {}

  scenario(
    name: string,
    meta: ScenarioMeta,
    define: (scenario: EffectScenario<any, any, any, any>) => unknown,
  ): this {
    const builder = new EffectScenarioBuilderImpl();
    define(builder);
    addScenario(this.declaration, {
      name,
      description: meta.description,
      mode: 'run',
      run: builder.build(meta.timeout),
    });
    return this;
  }

  skip(name: string, meta: ScenarioMeta): this {
    addScenario(this.declaration, {
      name,
      description: meta.description,
      mode: 'skip',
    });
    return this;
  }
}

class EffectScenarioBuilderImpl {
  private preparation: (() => unknown) | undefined;
  private expectation: ScenarioExpectation | undefined;
  private cleanupBody: ((prepared: unknown) => unknown) | undefined;

  prepare(prepare: () => unknown): this {
    this.preparation = prepare;
    return this;
  }

  verify(verify: (output: unknown, prepared: unknown) => unknown): this {
    this.expectation = { kind: 'success', verify };
    return this;
  }

  verifyError(verify: (error: unknown, prepared: unknown) => unknown): this {
    this.expectation = { kind: 'error', verify };
    return this;
  }

  cleanup(cleanup: (prepared: unknown) => unknown): this {
    this.cleanupBody = cleanup;
    return this;
  }

  build(timeout: Duration.Input | undefined) {
    if (this.preparation === undefined)
      throw new TypeError('Scenario preparation is required');
    if (this.expectation === undefined)
      throw new TypeError('Scenario verification is required');
    return {
      prepare: this.preparation,
      expectation: this.expectation,
      ...(this.cleanupBody === undefined ? {} : { cleanup: this.cleanupBody }),
      ...(timeout === undefined ? {} : { timeout }),
    };
  }
}

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

const CurrentVisit = Context.Reference<unknown | undefined>(
  'laymos/story/current-visit',
  { defaultValue: () => undefined },
);

interface DecisionState {
  readonly block: BlockDeclaration;
  readonly input: DecisionValue;
  readonly attributes: BlockMeta<[DecisionValue]>['attributes'];
  readonly arms: ArmDeclaration[];
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
    const arm: ArmDeclaration = {
      kind: 'literal',
      value,
      name: meta.name ?? String(value),
      description: meta.description,
    };
    this.state.arms.push(arm);
    if (!this.state.matched && Object.is(this.state.input, value)) {
      this.state.matched = true;
      this.state.selected = wrapEffect(
        this.state.block,
        { kind: 'literal', value },
        () => resolveAttributes(this.state.attributes, [this.state.input]),
        body(value),
        this.state.arms,
      );
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
    const arm: ArmDeclaration = {
      kind: 'otherwise',
      name: meta.name ?? 'Otherwise',
      description: meta.description,
    };
    this.state.arms.push(arm);
    if (!this.state.matched) {
      this.state.matched = true;
      this.state.selected = wrapEffect(
        this.state.block,
        { kind: 'otherwise' },
        () => resolveAttributes(this.state.attributes, [this.state.input]),
        body(this.state.input),
        this.state.arms,
      );
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
): (...args: Args) => Effect.Effect<A, E, R>;
export function functionBlock<Args extends readonly unknown[], A, E, R>(
  name: string,
  meta: BlockMeta<Args>,
  fn: (...args: Args) => Effect.Effect<A, E, R>,
): (...args: Args) => Effect.Effect<A, E, R> {
  const block = makeBlock(name, meta, 'block');
  return (...args) =>
    wrapEffect(
      block,
      undefined,
      () => resolveAttributes(meta.attributes, args),
      fn(...args),
    );
}

/** Wraps an Effect in an inline Story Block. */
export function step<A, E, R>(
  name: string,
  meta: BlockMeta,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R>;
export function step<A, E, R>(
  name: string,
  meta: BlockMeta,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return wrapEffect(
    makeBlock(name, meta, 'block'),
    undefined,
    () => resolveAttributes(meta.attributes, []),
    effect,
  );
}

/** Builds an eager, literal-keyed Effect Decision. */
export function decision<const Input extends DecisionValue>(
  name: string,
  meta: BlockMeta<[Input]>,
  input: Input,
): DecisionBuilder<Input, never, never, never>;
export function decision<const Input extends DecisionValue>(
  name: string,
  meta: BlockMeta<[Input]>,
  input: Input,
): DecisionBuilder<Input, never, never, never> {
  return new DecisionBuilderImpl({
    block: makeBlock(name, meta, 'decision'),
    input,
    attributes: meta.attributes as BlockMeta<[DecisionValue]>['attributes'],
    arms: [],
    matched: false,
    selected: Effect.void,
  }) as unknown as DecisionBuilder<Input, never, never, never>;
}

function wrapEffect<A, E, R>(
  block: BlockDeclaration,
  selectedArm: SelectedArm | undefined,
  attributes: () => Attributes | undefined,
  effect: Effect.Effect<A, E, R>,
  arms: readonly ArmDeclaration[] = [],
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const recorder = yield* CurrentRecorder;
    if (recorder === undefined) return yield* effect;
    for (const arm of arms) recorder.declareArm(block, arm);
    const parent = yield* CurrentVisit;
    const token = recorder.start(block, selectedArm, attributes(), parent);
    return yield* effect.pipe(
      Effect.onExit((exit) =>
        Effect.sync(() => {
          const outcome = Exit.isSuccess(exit)
            ? 'succeeded'
            : Cause.hasInterruptsOnly(exit.cause)
              ? 'interrupted'
              : 'failed';
          recorder.finish(token, outcome);
        }),
      ),
      Effect.provideService(CurrentVisit, token),
    );
  });
}

function makeBlock(
  name: string,
  meta: BlockMeta<any>,
  kind: BlockDeclaration['kind'],
): BlockDeclaration {
  requireDescription(
    meta.description,
    `${kind === 'decision' ? 'Decision' : 'Block'} "${name}"`,
  );
  return {
    name,
    kind,
    location: captureLocation(),
    description: meta.description,
  };
}

function requireDescription(description: string, subject: string): void {
  if (description.trim().length === 0) {
    throw new TypeError(`${subject} description must not be empty`);
  }
}

export type {
  ArmMeta,
  Attributes,
  BlockMeta,
  DecisionValue,
  StoryMeta,
} from '../core/types.js';
