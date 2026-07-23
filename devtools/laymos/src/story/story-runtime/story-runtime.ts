import { Cause, Context, Effect, Exit, Pipeable } from 'effect';
import type { Duration, Layer } from 'effect';

import { CurrentTrace, traceValue } from '../artifact/trace.js';

import {
  addScenario,
  declareStory,
  type MutableStoryDeclaration,
  type ScenarioExpectation,
} from '../core/declare.js';
import {
  captureLocation,
  CurrentRecorder,
  CurrentStoryBranch,
  resolveAttributes,
  type SourceLocation,
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
  OmissionMeta,
  StoryMeta,
  TerminalMeta,
} from '../core/types.js';

export interface ScenarioMeta {
  readonly description: string;
  readonly documentation?: import('../core/project-narrative.js').MarkdownContent;
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
      ...(meta.documentation === undefined
        ? {}
        : { documentation: meta.documentation.content }),
      mode: 'run',
      run: builder.build(meta.timeout),
    });
    return this;
  }

  skip(name: string, meta: ScenarioMeta): this {
    addScenario(this.declaration, {
      name,
      description: meta.description,
      ...(meta.documentation === undefined
        ? {}
        : { documentation: meta.documentation.content }),
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

const CurrentVisit = Context.Reference<unknown | undefined>(
  'laymos/story/current-visit',
  { defaultValue: () => undefined },
);

interface OpaqueOperation {
  readonly kind: 'Step' | 'Terminal' | 'Omission';
  readonly name: string;
}

const CurrentOpaqueOperation = Context.Reference<OpaqueOperation | undefined>(
  'laymos/story/current-opaque-operation',
  { defaultValue: () => undefined },
);

interface DecisionState {
  readonly block: BlockDeclaration;
  readonly value: DecisionValue;
  readonly attributes: BlockMeta<[DecisionValue]>['attributes'];
  readonly arms: Array<{
    readonly declaration: ArmDeclaration;
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
    location: SourceLocation,
  ): DecisionMatcherImpl {
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
      location,
      ...armOutcome(meta),
    };
    this.state.arms.push({ declaration: arm, body });
    return this;
  }

  addOrElse(
    meta: ArmMeta,
    body: () => AnyEffect,
    location: SourceLocation,
  ): DecisionMatcherImpl {
    requireDescription(
      meta.description,
      `Decision Arm "${meta.name ?? 'Otherwise'}"`,
    );
    const arm: ArmDeclaration = {
      kind: 'otherwise',
      name: meta.name ?? 'Otherwise',
      description: meta.description,
      visibility: meta.visibility ?? 'primary',
      location,
      ...armOutcome(meta),
    };
    this.state.arms.push({ declaration: arm, body });
    return this;
  }

  run(exhaustive: boolean): AnyEffect {
    const state = this.state;
    return Effect.gen(function* () {
      yield* rejectOpaqueNesting(`Decision "${state.block.name}"`);
      const trace = yield* CurrentTrace;
      if (trace !== undefined) {
        return yield* trace.recorder.decision(
          trace,
          state.block,
          state.arms.map((arm) => ({
            declaration: arm.declaration,
            body: arm.body,
          })),
        );
      }
      const input = state.value;
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
        selected.body,
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
export function flow<Args extends readonly unknown[], A, E, R>(
  name: string,
  meta: BlockMeta<Args>,
  input: (...args: Args) => Effect.Effect<A, E, R>,
): (...args: Args) => Effect.Effect<A, E, R> {
  const block = makeBlock(name, meta, 'flow');
  const run = (args: Args) =>
    Effect.gen(function* () {
      yield* rejectOpaqueNesting(`Flow "${name}"`);
      const trace = yield* CurrentTrace;
      if (trace !== undefined)
        return yield* trace.recorder.flow(trace, block, input(...args));
      return yield* wrapEffect(
        block,
        undefined,
        () => resolveAttributes(meta.attributes, args),
        () => input(...args),
      );
    }) as Effect.Effect<A, E, R>;
  return (...args: Args) => run(args);
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
  effect: () => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const block = makeBlock(name, meta, 'step');
  return Effect.gen(function* () {
    yield* rejectOpaqueNesting(`Step "${name}"`);
    const trace = yield* CurrentTrace;
    if (trace !== undefined) return trace.recorder.step(trace, block) as A;
    return yield* wrapEffect(
      block,
      undefined,
      () => resolveAttributes(meta.attributes, []),
      effect,
      [],
      { kind: 'Step', name },
    );
  });
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
  requireTerminalCompletion(meta);
  const block: BlockDeclaration = {
    ...makeBlock(name, meta, 'terminal'),
    completion: meta.completion,
  };
  return Effect.gen(function* () {
    yield* rejectOpaqueNesting(`Terminal "${name}"`);
    const trace = yield* CurrentTrace;
    if (trace !== undefined) return trace.recorder.terminal(trace, block) as A;
    return yield* wrapEffect(
      block,
      undefined,
      () => resolveAttributes(meta.attributes, []),
      effect,
      [],
      { kind: 'Terminal', name },
    );
  });
}

/** Starts a narrated matcher for an already-computed value. */
export function decision<const Input extends DecisionValue>(
  name: string,
  meta: BlockMeta<[Input]>,
  value: Input,
): DecisionMatcher<Input, Input, never, never, never> {
  if (value !== traceValue) requireDecisionArmValue(value);
  return new DecisionMatcherImpl({
    block: makeBlock(name, meta, 'decision'),
    value,
    attributes: meta.attributes as BlockMeta<[DecisionValue]>['attributes'],
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
  const location = captureLocation();
  return ((matcher: DecisionMatcherImpl) =>
    matcher.addWhen(pattern, meta, body, location)) as never;
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
  const location = captureLocation();
  return ((matcher: DecisionMatcherImpl) =>
    matcher.addOrElse(meta, body, location).run(false)) as never;
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
  const location = captureLocation();
  return Effect.gen(function* () {
    yield* rejectOpaqueNesting('Omission');
    const trace = yield* CurrentTrace;
    if (trace !== undefined) {
      return trace.recorder.omission(trace, location, meta.reason) as A;
    }
    return yield* body().pipe(
      Effect.provideService(CurrentRecorder, undefined),
      Effect.provideService(CurrentOpaqueOperation, {
        kind: 'Omission',
        name: meta.reason,
      }),
    );
  });
}

export const all = ((
  arg: Iterable<AnyEffect> | Record<string, AnyEffect>,
  options?: any,
) =>
  Effect.gen(function* () {
    yield* rejectOpaqueNesting('Concurrency scope');
    const trace = yield* CurrentTrace;
    if (trace === undefined) {
      const recorder = yield* CurrentRecorder;
      return yield* Effect.all(
        recorder === undefined ? (arg as any) : branchEffects(arg),
        options,
      );
    }
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
    yield* rejectOpaqueNesting('Concurrency scope');
    const trace = yield* CurrentTrace;
    if (trace === undefined) {
      const recorder = yield* CurrentRecorder;
      if (recorder === undefined)
        return yield* (Effect.forEach as any)(...args);
      const [self, iteratee, runtimeOptions] = args as [
        Iterable<unknown>,
        (value: unknown, index: number) => AnyEffect,
        unknown,
      ];
      return yield* (Effect.forEach as any)(
        self,
        (value: unknown, index: number) =>
          Effect.suspend(() => iteratee(value, index)).pipe(
            Effect.provideService(CurrentStoryBranch, {}),
          ),
        runtimeOptions,
      );
    }
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

function branchEffects(
  effects: Iterable<AnyEffect> | Record<string, AnyEffect>,
): Iterable<AnyEffect> | Record<string, AnyEffect> {
  const branch = (effect: AnyEffect) =>
    effect.pipe(Effect.provideService(CurrentStoryBranch, {}));
  return Symbol.iterator in Object(effects)
    ? [...(effects as Iterable<AnyEffect>)].map(branch)
    : Object.fromEntries(
        Object.entries(effects).map(([key, effect]) => [key, branch(effect)]),
      );
}

function wrapEffect<A, E, R>(
  block: BlockDeclaration,
  selectedArm: SelectedArm | undefined,
  attributes: () => Attributes | undefined,
  effect: () => Effect.Effect<A, E, R>,
  arms: readonly ArmDeclaration[] = [],
  opaqueOperation?: OpaqueOperation,
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const recorder = yield* CurrentRecorder;
    const operation = Effect.suspend(effect);
    const run =
      opaqueOperation === undefined
        ? operation
        : operation.pipe(
            Effect.provideService(CurrentOpaqueOperation, opaqueOperation),
          );
    if (recorder === undefined) return yield* run;
    for (const arm of arms) recorder.declareArm(block, arm);
    const parent = yield* CurrentVisit;
    const branch = yield* CurrentStoryBranch;
    const token = recorder.start(
      block,
      selectedArm,
      arms.find((arm) =>
        selectedArm?.kind === 'otherwise'
          ? arm.kind === 'otherwise'
          : arm.kind === 'literal' && arm.value === selectedArm?.value,
      ),
      attributes(),
      parent,
      branch,
    );
    return yield* run.pipe(
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

function armOutcome(
  meta: ArmMeta,
): Pick<ArmDeclaration, 'errors' | 'completion'> {
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

function rejectOpaqueNesting(subject: string): Effect.Effect<void> {
  return Effect.gen(function* () {
    const opaque = yield* CurrentOpaqueOperation;
    if (opaque === undefined) return;
    return yield* Effect.die(
      new Error(
        `${subject} cannot execute inside opaque ${opaque.kind} "${opaque.name}"; extract the nested Story activity to a Flow`,
      ),
    );
  });
}

export type {
  Attributes,
  OmissionMeta,
  TerminalCompletion,
  TerminalMeta,
} from '../core/types.js';
