import { Cause, Context, Effect, Exit } from 'effect';
import type { Duration, Layer } from 'effect';

import { CurrentTrace, traceValue } from '../artifact/trace.js';

import {
  addScenario,
  declareStoryGroup,
  declareStory,
  type MutableStoryDeclaration,
  type ScenarioExpectation,
  type StoryGroupDeclaration,
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

/** Declares the single Story owned by a Story file. */
export function story(
  name: string,
  meta: StoryMeta,
): EffectStoryBuilder<never> {
  return new EffectStoryBuilderImpl(declareStory(name, meta));
}

/** Declares a reusable Story Group. */
export function storyGroup(
  name: string,
  meta: StoryGroupMeta,
): EffectStoryGroup {
  return new EffectStoryGroupImpl(declareStoryGroup(name, meta));
}

class EffectStoryGroupImpl implements EffectStoryGroup {
  constructor(private readonly declaration: StoryGroupDeclaration) {}

  group(name: string, meta: StoryGroupMeta): EffectStoryGroup {
    return new EffectStoryGroupImpl(
      declareStoryGroup(name, meta, this.declaration),
    );
  }

  story(name: string, meta: StoryMeta): EffectStoryBuilder<never> {
    return new EffectStoryBuilderImpl(
      declareStory(name, meta, this.declaration),
    );
  }
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
  readonly selector: () => AnyEffect;
  readonly attributes: BlockMeta<[DecisionValue]>['attributes'];
  readonly arms: Array<{
    readonly declaration: ArmDeclaration;
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
    const arm: ArmDeclaration = {
      kind: 'literal',
      value,
      name: meta.name ?? String(value),
      description: meta.description,
      visibility: meta.visibility ?? 'primary',
    };
    this.state.arms.push({ declaration: arm, body });
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
      visibility: meta.visibility ?? 'primary',
    };
    this.state.arms.push({ declaration: arm, body });
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
      const trace = yield* CurrentTrace;
      if (trace !== undefined) {
        return yield* trace.recorder.decision(
          trace,
          state.block,
          Effect.suspend(state.selector),
          state.arms.map((arm) => ({
            declaration: arm.declaration,
            body: () => arm.body(traceValue as DecisionValue),
          })),
        );
      }
      const input = yield* Effect.suspend(state.selector);
      const selected =
        state.arms.find(
          ({ declaration }) =>
            declaration.kind === 'literal' && declaration.value === input,
        ) ??
        state.arms.find(({ declaration }) => declaration.kind === 'otherwise');
      if (selected === undefined) {
        return exhaustive
          ? yield* Effect.die(
              new Error(`Unexpected decision value: ${String(input)}`),
            )
          : undefined;
      }
      const selectedArm: SelectedArm =
        selected.declaration.kind === 'otherwise'
          ? { kind: 'otherwise' }
          : { kind: 'literal', value: selected.declaration.value };
      return yield* wrapEffect(
        state.block,
        selectedArm,
        () => resolveAttributes(state.attributes, [input]),
        () => selected.body(input),
        state.arms.map(({ declaration }) => declaration),
      );
    });
  }
}

/** Marks a reusable Effect-returning function boundary as a Story Block. */
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
  const block = makeBlock(name, meta, 'flow');
  const run = (args: Args, effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const trace = yield* CurrentTrace;
      if (trace !== undefined)
        return yield* trace.recorder.flow(trace, block, effect);
      return yield* wrapEffect(
        block,
        undefined,
        () => resolveAttributes(meta.attributes, args),
        () => effect,
      );
    }) as Effect.Effect<A, E, R>;
  return typeof input === 'function'
    ? (...args: Args) =>
        run(
          args,
          Effect.suspend(() => input(...args)),
        )
    : run([] as unknown as Args, input);
}

/** Wraps an Effect in an inline Story Block. */
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
  const block = makeBlock(name, meta, 'step');
  const operation = () => (typeof effect === 'function' ? effect() : effect);
  return Effect.gen(function* () {
    const trace = yield* CurrentTrace;
    if (trace !== undefined) return trace.recorder.step(trace, block) as A;
    return yield* wrapEffect(
      block,
      undefined,
      () => resolveAttributes(meta.attributes, []),
      operation,
    );
  });
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
  return new DecisionBuilderImpl({
    block: makeBlock(name, meta, 'decision'),
    selector:
      typeof selector === 'function'
        ? selector
        : () => Effect.succeed(selector),
    attributes: meta.attributes as BlockMeta<[DecisionValue]>['attributes'],
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
  const location = captureLocation();
  const label = typeof labelOrBody === 'string' ? labelOrBody : undefined;
  const operation = typeof labelOrBody === 'function' ? labelOrBody : body!;
  return Effect.gen(function* () {
    const trace = yield* CurrentTrace;
    if (trace !== undefined) {
      return trace.recorder.omission(trace, location, label) as A;
    }
    return yield* Effect.suspend(operation).pipe(
      Effect.provideService(CurrentRecorder, undefined),
    );
  });
}

export const all = ((
  arg: Iterable<AnyEffect> | Record<string, AnyEffect>,
  options?: any,
) =>
  Effect.gen(function* () {
    const trace = yield* CurrentTrace;
    if (trace === undefined) return yield* Effect.all(arg as any, options);
    const effects =
      Symbol.iterator in Object(arg)
        ? [...(arg as Iterable<AnyEffect>)]
        : Object.values(arg);
    return yield* trace.recorder.all(trace, effects, options ?? {});
  })) as typeof Effect.all;

const storyForEach = (...args: readonly unknown[]): unknown => {
  if (typeof args[0] === 'function' && typeof args[1] !== 'function') {
    const [body, options] = args;
    return (self: Iterable<unknown>) => storyForEach(self, body, options);
  }
  const [, body, options] = args;
  return Effect.gen(function* () {
    const trace = yield* CurrentTrace;
    if (trace === undefined) return yield* (Effect.forEach as any)(...args);
    return yield* trace.recorder.forEach(
      trace,
      (body as (value: unknown, index: number) => AnyEffect)(
        traceValue,
        traceValue as number,
      ),
      (options as any) ?? {},
    );
  });
};

export const forEach = storyForEach as typeof Effect.forEach;

function wrapEffect<A, E, R>(
  block: BlockDeclaration,
  selectedArm: SelectedArm | undefined,
  attributes: () => Attributes | undefined,
  effect: () => Effect.Effect<A, E, R>,
  arms: readonly ArmDeclaration[] = [],
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const recorder = yield* CurrentRecorder;
    if (recorder === undefined) return yield* Effect.suspend(effect);
    for (const arm of arms) recorder.declareArm(block, arm);
    const parent = yield* CurrentVisit;
    const token = recorder.start(block, selectedArm, attributes(), parent);
    return yield* Effect.suspend(effect).pipe(
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
    visibility: meta.visibility ?? 'primary',
  };
}

function requireDescription(description: string, subject: string): void {
  if (description.trim().length === 0) {
    throw new TypeError(`${subject} description must not be empty`);
  }
}

function requireDecisionArmValue(value: DecisionValue): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Decision Arm numeric values must be finite');
  }
}
