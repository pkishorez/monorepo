import { Schema } from 'effect';

/** Severity of a static doc-contract diagnostic. */
export const DiagnosticLevel = Schema.Literals(['error', 'warning']);

/**
 * A static validation result about the doc-test contract for a package,
 * produced without running any tests.
 */
export const Diagnostic = Schema.Struct({
  level: DiagnosticLevel,
  feature: Schema.optional(Schema.String),
  groupId: Schema.optional(Schema.String),
  message: Schema.String,
});
export type Diagnostic = typeof Diagnostic.Type;

/** A reference to a test group folder discovered under a feature. */
export const TestGroupRef = Schema.Struct({
  id: Schema.String,
  dir: Schema.String,
  testFiles: Schema.Array(Schema.String),
});
export type TestGroupRef = typeof TestGroupRef.Type;

/** A directive occurrence inside a `doc.md`. */
export const DirectiveRef = Schema.Struct({
  id: Schema.String,
  offset: Schema.Number,
});
export type DirectiveRef = typeof DirectiveRef.Type;

/** A documented unit of package behavior: one `doc.md` plus its test groups. */
export const Feature = Schema.Struct({
  name: Schema.String,
  dir: Schema.String,
  docPath: Schema.String,
  doc: Schema.String,
  directives: Schema.Array(DirectiveRef),
  groups: Schema.Array(TestGroupRef),
});
export type Feature = typeof Feature.Type;

/** A named, ordered group of features in the course outline. */
export const TocSection = Schema.Struct({
  title: Schema.String,
  features: Schema.Array(Schema.String),
});
export type TocSection = typeof TocSection.Type;

/** The typed per-package manifest: features in reading order, grouped. */
export const Toc = Schema.Struct({
  sections: Schema.Array(TocSection),
});
export type Toc = typeof Toc.Type;

/** Run status of a documented test or suite. */
export const TestStatus = Schema.Literals([
  'pass',
  'fail',
  'skip',
  'pending',
  'running',
]);
export type TestStatus = typeof TestStatus.Type;

/** A leaf node in a documented suite result tree. */
export const TestNode = Schema.Struct({
  kind: Schema.Literal('test'),
  name: Schema.String,
  vdoc: Schema.NullOr(Schema.String),
  status: TestStatus,
  durationMs: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
  /** Relative source file the test was statically extracted from. */
  file: Schema.optional(Schema.String),
  /** 1-based line of the `vtest(`/`test(` call. */
  startLine: Schema.optional(Schema.Number),
  /** 1-based line of the matching close paren of that call. */
  endLine: Schema.optional(Schema.Number),
});
export type TestNode = typeof TestNode.Type;

interface SuiteNodeType {
  readonly kind: 'suite';
  readonly name: string;
  readonly vdoc: string | null;
  readonly status: TestStatus;
  readonly children: ReadonlyArray<SuiteNodeType | TestNode>;
}

/** A suite (group) node in a documented suite result tree; nests recursively. */
export const SuiteNode: Schema.Codec<SuiteNodeType> = Schema.Struct({
  kind: Schema.Literal('suite'),
  name: Schema.String,
  vdoc: Schema.NullOr(Schema.String),
  status: TestStatus,
  children: Schema.Array(
    Schema.Union([
      Schema.suspend((): Schema.Codec<SuiteNodeType> => SuiteNode),
      TestNode,
    ]),
  ),
});
export type SuiteNode = typeof SuiteNode.Type;

/**
 * A single live event emitted on the per-package event stream. A run produces
 * an ordered `run-started` -> N x `test-updated` -> `run-finished`; a `doc.md`
 * edit produces a standalone `health-updated`. Every variant carries `pkg`;
 * `test-updated` additionally carries the full identity (`feature`, `groupId`,
 * `name`) a client needs to route the update to the right test row.
 */
export const TestEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('run-started'),
    pkg: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('test-updated'),
    pkg: Schema.String,
    feature: Schema.String,
    groupId: Schema.String,
    name: Schema.String,
    status: TestStatus,
    durationMs: Schema.optional(Schema.Number),
    error: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('run-finished'),
    pkg: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('health-updated'),
    pkg: Schema.String,
    diagnostics: Schema.Array(Diagnostic),
  }),
]);
export type TestEvent = typeof TestEvent.Type;
