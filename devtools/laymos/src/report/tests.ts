import { Schema } from 'effect';

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending';
export type TestValue =
  | string
  | number
  | boolean
  | null
  | readonly TestValue[]
  | { readonly [key: string]: TestValue };

export interface TestErrorReport {
  readonly name: string;
  readonly message: string;
  readonly stack?: string | undefined;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
  readonly diff?: string | undefined;
}

export interface TestSourceLocation {
  readonly line: number;
  readonly column: number;
}

export interface TestAssertionEvidence {
  readonly name: string;
  readonly matcher: string;
  readonly status: 'passed' | 'failed';
  readonly actual?: TestValue | undefined;
  readonly expected?: TestValue | undefined;
  readonly error?: TestErrorReport | undefined;
}

export interface TestTraceEvent {
  readonly name: string;
  readonly timestamp: number;
  readonly attributes: Readonly<Record<string, TestValue>>;
}

export interface TestTraceLog {
  readonly spanId: string | null;
  readonly timestamp: number;
  readonly level: 'Fatal' | 'Error' | 'Warn' | 'Info' | 'Debug' | 'Trace';
  readonly message: TestValue;
  readonly annotations: Readonly<Record<string, TestValue>>;
}

export interface TestTraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly status: 'success' | 'error' | 'unset';
  readonly attributes: Readonly<Record<string, TestValue>>;
  readonly events: readonly TestTraceEvent[];
}

export interface LaymosTestEvidence {
  readonly description: string;
  readonly documentation?: string | undefined;
  readonly assertions: readonly TestAssertionEvidence[];
  readonly trace?:
    | {
        readonly spans: readonly TestTraceSpan[];
        readonly logs: readonly TestTraceLog[];
      }
    | undefined;
}

export interface TestCaseReport {
  readonly id: string;
  readonly name: string;
  readonly fullName: string;
  readonly status: TestStatus;
  readonly duration: number;
  readonly errors: readonly TestErrorReport[];
  readonly location?: TestSourceLocation | undefined;
  readonly authoredBy?: 'laymos' | undefined;
  readonly evidence?: LaymosTestEvidence | undefined;
}

export interface TestSuiteReport {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly documentation?: string | undefined;
  readonly status: TestStatus;
  readonly suites: readonly TestSuiteReport[];
  readonly cases: readonly TestCaseReport[];
  readonly errors: readonly TestErrorReport[];
}

export interface TestModuleReport {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly projectName: string;
  readonly status: TestStatus;
  readonly duration: number;
  readonly suites: readonly TestSuiteReport[];
  readonly cases: readonly TestCaseReport[];
  readonly errors: readonly TestErrorReport[];
}

export interface TestsReport {
  readonly status: 'passed' | 'failed';
  readonly duration: number;
  readonly modules: readonly TestModuleReport[];
  readonly unhandledErrors: readonly TestErrorReport[];
}

export const TestValueSchema: Schema.Codec<TestValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.String,
    Schema.Number,
    Schema.Boolean,
    Schema.Null,
    Schema.Array(TestValueSchema),
    Schema.Record(Schema.String, TestValueSchema),
  ]),
);

export const TestErrorReportSchema = Schema.Struct({
  name: Schema.String,
  message: Schema.String,
  stack: Schema.optional(Schema.String),
  expected: Schema.optional(Schema.String),
  actual: Schema.optional(Schema.String),
  diff: Schema.optional(Schema.String),
});

export const TestSourceLocationSchema = Schema.Struct({
  line: Schema.Number,
  column: Schema.Number,
});

export const TestAssertionEvidenceSchema = Schema.Struct({
  name: Schema.String,
  matcher: Schema.String,
  status: Schema.Literals(['passed', 'failed']),
  actual: Schema.optional(TestValueSchema),
  expected: Schema.optional(TestValueSchema),
  error: Schema.optional(TestErrorReportSchema),
});

export const TestTraceEventSchema = Schema.Struct({
  name: Schema.String,
  timestamp: Schema.Number,
  attributes: Schema.Record(Schema.String, TestValueSchema),
});

export const TestTraceLogSchema = Schema.Struct({
  spanId: Schema.NullOr(Schema.String),
  timestamp: Schema.Number,
  level: Schema.Literals(['Fatal', 'Error', 'Warn', 'Info', 'Debug', 'Trace']),
  message: TestValueSchema,
  annotations: Schema.Record(Schema.String, TestValueSchema),
});

export const TestTraceSpanSchema = Schema.Struct({
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: Schema.NullOr(Schema.String),
  name: Schema.String,
  startTime: Schema.Number,
  endTime: Schema.Number,
  status: Schema.Literals(['success', 'error', 'unset']),
  attributes: Schema.Record(Schema.String, TestValueSchema),
  events: Schema.Array(TestTraceEventSchema),
});

export const LaymosTestEvidenceSchema = Schema.Struct({
  description: Schema.String,
  documentation: Schema.optional(Schema.String),
  assertions: Schema.Array(TestAssertionEvidenceSchema),
  trace: Schema.optional(
    Schema.Struct({
      spans: Schema.Array(TestTraceSpanSchema),
      logs: Schema.Array(TestTraceLogSchema),
    }),
  ),
});

export const TestCaseReportSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  fullName: Schema.String,
  status: Schema.Literals(['passed', 'failed', 'skipped', 'pending']),
  duration: Schema.Number,
  errors: Schema.Array(TestErrorReportSchema),
  location: Schema.optional(TestSourceLocationSchema),
  authoredBy: Schema.optional(Schema.Literal('laymos')),
  evidence: Schema.optional(LaymosTestEvidenceSchema),
});

export const TestSuiteReportSchema: Schema.Codec<TestSuiteReport> =
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    description: Schema.optional(Schema.String),
    documentation: Schema.optional(Schema.String),
    status: Schema.Literals(['passed', 'failed', 'skipped', 'pending']),
    suites: Schema.Array(Schema.suspend(() => TestSuiteReportSchema)),
    cases: Schema.Array(TestCaseReportSchema),
    errors: Schema.Array(TestErrorReportSchema),
  });

export const TestModuleReportSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  projectName: Schema.String,
  status: Schema.Literals(['passed', 'failed', 'skipped', 'pending']),
  duration: Schema.Number,
  suites: Schema.Array(TestSuiteReportSchema),
  cases: Schema.Array(TestCaseReportSchema),
  errors: Schema.Array(TestErrorReportSchema),
});

export const TestsReportSchema = Schema.Struct({
  status: Schema.Literals(['passed', 'failed']),
  duration: Schema.Number,
  modules: Schema.Array(TestModuleReportSchema),
  unhandledErrors: Schema.Array(TestErrorReportSchema),
});
