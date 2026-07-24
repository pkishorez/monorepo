import { Effect, Exit, Logger, Option, References, Tracer } from 'effect';
import { stringify } from '@vitest/utils/display';
import {
  describe as vitestDescribe,
  recordArtifact,
  test as vitestTest,
  type ExpectStatic,
  type TestArtifactBase,
  type TestContext,
  type TestOptions,
  type SuiteOptions,
} from 'vitest';

import type {
  LaymosTestEvidence,
  TestAssertionEvidence,
  TestErrorReport,
  TestTraceLog,
  TestTraceSpan,
  TestValue,
} from '../../report/tests.js';

interface LaymosMetadata {
  readonly description: string;
  readonly documentation?: string;
}

interface SpanSelector {
  readonly name?: string | RegExp;
  readonly status?: TestTraceSpan['status'];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

interface TraceCapture {
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>;
  getSpans(selector?: SpanSelector): readonly TestTraceSpan[];
  getSpanCount(selector?: SpanSelector): number;
}

interface LaymosContext extends TestContext {
  readonly expect: ExpectStatic;
  readonly trace: TraceCapture;
}

type LaymosHandler = (context: LaymosContext) => LaymosHandlerResult;
type LaymosHandlerResult =
  | void
  | Promise<void>
  | Effect.Effect<void, unknown, never>;

type LaymosTestOptions = Omit<TestOptions, 'fails'> & LaymosMetadata;
type LaymosDescribeOptions = Omit<SuiteOptions, 'fails'> & LaymosMetadata;

interface LaymosEachTest {
  <Row extends readonly unknown[]>(
    cases: ReadonlyArray<Row>,
  ): (
    name: string,
    options: LaymosTestOptions,
    handler: (...argumentsList: [...Row, LaymosContext]) => LaymosHandlerResult,
  ) => unknown;
  <Row>(
    cases: ReadonlyArray<Row>,
  ): (
    name: string,
    options: LaymosTestOptions,
    handler: (row: Row, context: LaymosContext) => LaymosHandlerResult,
  ) => unknown;
  (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): (
    name: string,
    options: LaymosTestOptions,
    handler: (
      row: Readonly<Record<string, unknown>>,
      context: LaymosContext,
    ) => LaymosHandlerResult,
  ) => unknown;
}

interface LaymosTestApi {
  (name: string, options: LaymosTestOptions, handler: LaymosHandler): unknown;
  only: LaymosTestApi;
  skip: LaymosTestApi;
  todo(name: string, options: LaymosTestOptions): unknown;
  each: LaymosEachTest;
  extend(...argumentsList: Parameters<typeof vitestTest.extend>): LaymosTestApi;
  skipIf(...argumentsList: Parameters<typeof vitestTest.skipIf>): LaymosTestApi;
  runIf(...argumentsList: Parameters<typeof vitestTest.runIf>): LaymosTestApi;
}

interface LaymosEachDescribe {
  <Row extends readonly unknown[]>(
    cases: ReadonlyArray<Row>,
  ): (
    name: string,
    options: LaymosDescribeOptions,
    factory: (...argumentsList: Row) => void | Promise<void>,
  ) => unknown;
  <Row>(
    cases: ReadonlyArray<Row>,
  ): (
    name: string,
    options: LaymosDescribeOptions,
    factory: (row: Row) => void | Promise<void>,
  ) => unknown;
  (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): (
    name: string,
    options: LaymosDescribeOptions,
    factory: (row: Readonly<Record<string, unknown>>) => void | Promise<void>,
  ) => unknown;
}

interface LaymosDescribeApi {
  (
    name: string,
    options: LaymosDescribeOptions,
    factory: () => void | Promise<void>,
  ): unknown;
  only: LaymosDescribeApi;
  skip: LaymosDescribeApi;
  todo(name: string, options: LaymosDescribeOptions): unknown;
  each: LaymosEachDescribe;
  skipIf(
    ...argumentsList: Parameters<typeof vitestDescribe.skipIf>
  ): LaymosDescribeApi;
  runIf(
    ...argumentsList: Parameters<typeof vitestDescribe.runIf>
  ): LaymosDescribeApi;
}

interface LaymosTestArtifact extends TestArtifactBase {
  readonly type: 'laymos:test-evidence';
  readonly evidence: LaymosTestEvidence;
}

const laymosTestArtifactKey: unique symbol = Symbol('laymos:test-evidence');

declare module 'vitest' {
  interface TaskMeta {
    readonly laymosTest?: LaymosMetadata;
    readonly laymosSuite?: LaymosMetadata;
  }

  interface TestArtifactRegistry {
    [laymosTestArtifactKey]: LaymosTestArtifact;
  }
}

export const laymosTest = wrapTestApi(vitestTest) as unknown as LaymosTestApi;
export const laymosDescribe = wrapDescribeApi(
  vitestDescribe,
) as unknown as LaymosDescribeApi;

function wrapTestApi(
  api: typeof vitestTest,
  spreadEachArguments = false,
): typeof vitestTest {
  return new Proxy(api, {
    apply(target, thisArgument, argumentsList) {
      const [name, options, handler] = argumentsList;
      const metadata = validateMetadata(name, options, 'Laymos Test');
      if (options.fails === true) {
        throw new TypeError('Laymos Tests do not support the "fails" option');
      }
      const testOptions = withMeta(options, 'laymosTest', metadata);
      if (typeof handler !== 'function') {
        return Reflect.apply(target, thisArgument, [name, testOptions]);
      }
      return Reflect.apply(target, thisArgument, [
        name,
        testOptions,
        async (...callbackArguments: unknown[]) => {
          const context = callbackArguments.at(-1) as TestContext;
          const callbackValues = callbackArguments.slice(0, -1);
          const handlerArguments =
            spreadEachArguments &&
            callbackValues.length === 1 &&
            Array.isArray(callbackValues[0])
              ? callbackValues[0]
              : callbackValues;
          const assertions: TestAssertionEvidence[] = [];
          const assertionErrors: Error[] = [];
          const names = new Set<string>();
          const trace = makeTraceCapture();
          const scopedExpect = makeExpect(
            context.expect,
            assertions,
            assertionErrors,
            names,
          );
          let executionError: unknown;

          try {
            const result = Reflect.apply(handler, undefined, [
              ...handlerArguments,
              { ...context, expect: scopedExpect, trace },
            ]);
            if (Effect.isEffect(result)) {
              await Effect.runPromise(
                result as Effect.Effect<void, unknown, never>,
                { signal: context.signal },
              );
            } else {
              await result;
            }
            if (assertions.length === 0) {
              throw namedError(
                'MissingTestAssertion',
                'A completed Laymos Test must record at least one named assertion',
              );
            }
          } catch (error) {
            executionError = error;
          } finally {
            await recordArtifact(context.task, {
              type: 'laymos:test-evidence',
              evidence: {
                ...metadata,
                assertions,
                ...(trace.completedTrace === undefined
                  ? {}
                  : { trace: trace.completedTrace }),
              },
            });
          }

          if (executionError !== undefined) throw executionError;
          if (assertionErrors.length > 0) {
            const failure = new AggregateError(
              assertionErrors,
              `${assertionErrors.length} named assertion(s) failed`,
            );
            failure.name = 'LaymosAssertionFailures';
            throw failure;
          }
        },
      ]);
    },
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (property === 'each') {
        const forEach = Reflect.get(target, 'for', target) as typeof value;
        return (...argumentsList: readonly unknown[]) =>
          wrapTestApi(Reflect.apply(forEach, target, argumentsList), true);
      }
      if (
        property === 'extend' ||
        property === 'skipIf' ||
        property === 'runIf'
      ) {
        return (...argumentsList: readonly unknown[]) =>
          wrapTestApi(Reflect.apply(value, target, argumentsList));
      }
      return wrapTestApi(value as typeof vitestTest);
    },
  });
}

function wrapDescribeApi(api: typeof vitestDescribe): typeof vitestDescribe {
  return new Proxy(api, {
    apply(target, thisArgument, argumentsList) {
      const [name, options, factory] = argumentsList;
      const metadata = validateMetadata(name, options, 'Laymos Suite');
      if (options.fails === true) {
        throw new TypeError('Laymos Suites do not support the "fails" option');
      }
      return Reflect.apply(target, thisArgument, [
        name,
        withMeta(options, 'laymosSuite', metadata),
        factory,
      ]);
    },
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (
        property === 'each' ||
        property === 'skipIf' ||
        property === 'runIf'
      ) {
        return (...argumentsList: readonly unknown[]) =>
          wrapDescribeApi(Reflect.apply(value, target, argumentsList));
      }
      return wrapDescribeApi(value as typeof vitestDescribe);
    },
  });
}

function validateMetadata(
  name: unknown,
  options: unknown,
  subject: string,
): LaymosMetadata {
  requireText(name, `${subject} name`);
  if (!isRecord(options)) {
    throw new TypeError(`${subject} options are required`);
  }
  requireText(options.description, `${subject} description`);
  if (options.documentation !== undefined) {
    requireText(options.documentation, `${subject} documentation`);
  }
  return {
    description: options.description,
    ...(options.documentation === undefined
      ? {}
      : { documentation: options.documentation }),
  };
}

function withMeta(
  options: Readonly<Record<string, unknown>>,
  key: 'laymosTest' | 'laymosSuite',
  metadata: LaymosMetadata,
): Readonly<Record<string, unknown>> {
  const { description: _, documentation: __, ...testOptions } = options;
  return {
    ...testOptions,
    meta: {
      ...(isRecord(options.meta) ? options.meta : {}),
      [key]: metadata,
    },
  };
}

function makeExpect(
  expect: ExpectStatic,
  assertions: TestAssertionEvidence[],
  errors: Error[],
  names: Set<string>,
): ExpectStatic {
  return new Proxy(expect, {
    apply(target, thisArgument, [actual, message]) {
      requireText(message, 'Test Assertion name');
      const name = message.trim();
      if (names.has(name)) {
        throw namedError(
          'DuplicateTestAssertionName',
          `Test Assertion names must be unique: "${name}"`,
        );
      }
      names.add(name);
      const assertion = Reflect.apply(target, thisArgument, [actual, message]);
      return wrapAssertion(assertion, {
        actual,
        name,
        assertions,
        errors,
        path: [],
      });
    },
  });
}

function wrapAssertion(
  assertion: object,
  state: {
    readonly actual: unknown;
    readonly name: string;
    readonly assertions: TestAssertionEvidence[];
    readonly errors: Error[];
    readonly path: readonly string[];
  },
): object {
  return new Proxy(assertion, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      const nextPath = [...state.path, String(property)];
      if (typeof value !== 'function') {
        return isRecord(value)
          ? wrapAssertion(value, { ...state, path: nextPath })
          : value;
      }
      return (...expectedArguments: readonly unknown[]) => {
        try {
          const result = Reflect.apply(value, target, expectedArguments);
          if (isPromiseLike(result)) {
            return result.then(
              (resolved) => {
                recordAssertion(state, nextPath, expectedArguments, 'passed');
                return resolved;
              },
              (error) => {
                recordAssertion(
                  state,
                  nextPath,
                  expectedArguments,
                  'failed',
                  error,
                );
              },
            );
          }
          recordAssertion(state, nextPath, expectedArguments, 'passed');
          return result;
        } catch (error) {
          recordAssertion(state, nextPath, expectedArguments, 'failed', error);
          return assertion;
        }
      };
    },
  });
}

function recordAssertion(
  state: {
    readonly actual: unknown;
    readonly name: string;
    readonly assertions: TestAssertionEvidence[];
    readonly errors: Error[];
  },
  path: readonly string[],
  expectedArguments: readonly unknown[],
  status: 'passed' | 'failed',
  failure?: unknown,
): void {
  const error = failure instanceof Error ? failure : new Error(String(failure));
  state.assertions.push({
    name: state.name,
    matcher: path.join('.'),
    status,
    actual: testValue(state.actual),
    ...(expectedArguments.length === 0
      ? {}
      : {
          expected: testValue(
            expectedArguments.length === 1
              ? expectedArguments[0]
              : expectedArguments,
          ),
        }),
    ...(status === 'failed' ? { error: errorReport(error) } : {}),
  });
  if (status === 'failed') state.errors.push(error);
}

function makeTraceCapture(): TraceCapture & {
  readonly completedTrace?: {
    readonly spans: readonly TestTraceSpan[];
    readonly logs: readonly TestTraceLog[];
  };
} {
  let started = false;
  let completedTrace:
    | {
        readonly spans: readonly TestTraceSpan[];
        readonly logs: readonly TestTraceLog[];
      }
    | undefined;

  const capture = (<A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    Effect.suspend(() => {
      if (started) {
        return Effect.die(
          namedError(
            'TestTraceAlreadyCaptured',
            'A Laymos Test can capture only one Effect trace',
          ),
        );
      }
      started = true;
      const spans: Tracer.NativeSpan[] = [];
      const logs: TestTraceLog[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const logger = Logger.make<unknown, void>((options) => {
        if (options.logLevel === 'All' || options.logLevel === 'None') return;
        logs.push({
          spanId: options.fiber.currentSpan?.spanId ?? null,
          timestamp: options.date.getTime(),
          level: options.logLevel,
          message: testValue(
            Array.isArray(options.message) && options.message.length === 1
              ? options.message[0]
              : options.message,
          ),
          annotations: Object.fromEntries(
            Object.entries(
              options.fiber.getRef(References.CurrentLogAnnotations),
            ).map(([key, value]) => [key, testValue(value)]),
          ),
        });
      });
      return effect.pipe(
        Effect.withTracer(tracer),
        Effect.provide(Logger.layer([logger])),
        Effect.ensuring(
          Effect.sync(() => {
            const normalizedSpans = normalizeSpans(spans);
            const capturedSpanIds = new Set(
              normalizedSpans.map(({ spanId }) => spanId),
            );
            completedTrace = {
              spans: normalizedSpans,
              logs: logs
                .map((log) => ({
                  ...log,
                  spanId:
                    log.spanId !== null && capturedSpanIds.has(log.spanId)
                      ? log.spanId
                      : null,
                }))
                .sort((left, right) => left.timestamp - right.timestamp),
            };
          }),
        ),
      );
    })) as TraceCapture & {
    readonly completedTrace?: {
      readonly spans: readonly TestTraceSpan[];
      readonly logs: readonly TestTraceLog[];
    };
  };

  capture.getSpans = (selector?: SpanSelector) => {
    if (completedTrace === undefined) {
      throw namedError(
        'TestTraceNotCaptured',
        'Trace evidence is available only after trace(effect) completes',
      );
    }
    return selector === undefined
      ? completedTrace.spans
      : completedTrace.spans.filter((span) => matchesSpan(span, selector));
  };
  capture.getSpanCount = (selector?: SpanSelector) =>
    capture.getSpans(selector).length;
  Object.defineProperty(capture, 'completedTrace', {
    get: () => completedTrace,
  });
  return capture;
}

function normalizeSpans(spans: readonly Tracer.NativeSpan[]): TestTraceSpan[] {
  for (const span of spans) {
    if (span.status._tag === 'Started') {
      throw namedError(
        'IncompleteTestTrace',
        `Span "${span.name}" did not finish inside the traced Effect`,
      );
    }
  }
  const normalized = spans.map((span): TestTraceSpan => {
    const status = span.status;
    if (status._tag === 'Started') throw new Error('unreachable');
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: Option.match(span.parent, {
        onNone: () => null,
        onSome: (parent) => parent.spanId,
      }),
      name: span.name,
      startTime: Number(status.startTime) / 1_000_000,
      endTime: Number(status.endTime) / 1_000_000,
      status: Exit.isSuccess(status.exit) ? 'success' : 'error',
      attributes: Object.fromEntries(
        [...span.attributes].map(([key, value]) => [key, testValue(value)]),
      ),
      events: span.events.map(([name, timestamp, attributes]) => ({
        name,
        timestamp: Number(timestamp) / 1_000_000,
        attributes: Object.fromEntries(
          Object.entries(attributes).map(([key, value]) => [
            key,
            testValue(value),
          ]),
        ),
      })),
    };
  });
  return sortSpans(normalized);
}

function sortSpans(spans: readonly TestTraceSpan[]): TestTraceSpan[] {
  const byId = new Map(spans.map((span) => [span.spanId, span]));
  const children = new Map<string | null, TestTraceSpan[]>();
  for (const span of spans) {
    const parent = span.parentSpanId;
    const group = parent !== null && byId.has(parent) ? parent : null;
    children.set(group, [...(children.get(group) ?? []), span]);
  }
  const compare = (left: TestTraceSpan, right: TestTraceSpan) =>
    left.startTime - right.startTime || left.spanId.localeCompare(right.spanId);
  const ordered: TestTraceSpan[] = [];
  const seen = new Set<string>();
  const visit = (span: TestTraceSpan): void => {
    if (seen.has(span.spanId)) return;
    seen.add(span.spanId);
    ordered.push(span);
    for (const child of (children.get(span.spanId) ?? []).sort(compare)) {
      visit(child);
    }
  };
  for (const root of (children.get(null) ?? []).sort(compare)) visit(root);
  for (const span of [...spans].sort(compare)) visit(span);
  return ordered;
}

function matchesSpan(span: TestTraceSpan, selector: SpanSelector): boolean {
  if (
    selector.name !== undefined &&
    (typeof selector.name === 'string'
      ? span.name !== selector.name
      : !new RegExp(selector.name.source, selector.name.flags).test(span.name))
  ) {
    return false;
  }
  if (selector.status !== undefined && span.status !== selector.status) {
    return false;
  }
  return Object.entries(selector.attributes ?? {}).every(([key, value]) =>
    valuesEqual(span.attributes[key], testValue(value)),
  );
}

function valuesEqual(left: TestValue | undefined, right: TestValue): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]!))
    );
  }
  if (
    isRecord(left) &&
    !Array.isArray(left) &&
    isRecord(right) &&
    !Array.isArray(right)
  ) {
    const leftRecord = left as Readonly<Record<string, TestValue>>;
    const rightRecord = right as Readonly<Record<string, TestValue>>;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          key in right && valuesEqual(leftRecord[key], rightRecord[key]!),
      )
    );
  }
  return false;
}

function testValue(value: unknown): TestValue {
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) return JSON.parse(serialized) as TestValue;
  } catch {}
  return stringify(value);
}

function errorReport(error: Error): TestErrorReport {
  return {
    name: error.name || 'Error',
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
  };
}

function namedError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

function requireText(value: unknown, subject: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${subject} must not be empty`);
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === 'function';
}
