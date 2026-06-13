import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  Diagnostic,
  DirectiveRef,
  TestStatus,
  TocSection,
} from '@monorepo/vtest/analysis/model';
import type { DepcruiseVizData } from 'dependency-cruiser-viz';

/** A genuine fs/exec failure while assembling a payload (not "not configured"). */
export class DevtoolsRpcError extends Schema.TaggedErrorClass<DevtoolsRpcError>(
  'DevtoolsRpcError',
)('DevtoolsRpcError', {
  message: Schema.String,
}) {}

const VtestFile = Schema.Struct({
  path: Schema.String,
  source: Schema.String,
});

const VtestTest = Schema.Struct({
  name: Schema.String,
  vdoc: Schema.NullOr(Schema.String),
  status: TestStatus,
  durationMs: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
  file: Schema.String,
  startLine: Schema.Number,
  endLine: Schema.Number,
});

const VtestGroup = Schema.Struct({
  id: Schema.String,
  files: Schema.Array(VtestFile),
  tests: Schema.Array(VtestTest),
});

const VtestFeature = Schema.Struct({
  name: Schema.String,
  markdown: Schema.String,
  directives: Schema.Array(DirectiveRef),
  diagnostics: Schema.Array(Diagnostic),
  groups: Schema.Array(VtestGroup),
});

const RunVtestSuccess = Schema.Union([
  Schema.Struct({ available: Schema.Literal(false) }),
  Schema.Struct({
    available: Schema.Literal(true),
    package: Schema.Struct({ name: Schema.String, dir: Schema.String }),
    /** The package's `home.md` overview prose, or `null` when it ships none. */
    overview: Schema.NullOr(Schema.String),
    toc: Schema.Struct({ sections: Schema.Array(TocSection) }),
    features: Schema.Array(VtestFeature),
  }),
]);

/** A flat per-test run record, keyed by `feature`/`groupId`/`name`. */
const RunRecord = Schema.Struct({
  feature: Schema.String,
  groupId: Schema.String,
  name: Schema.String,
  status: TestStatus,
  durationMs: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
});

const RunVtestRunSuccess = Schema.Union([
  Schema.Struct({ available: Schema.Literal(false) }),
  Schema.Struct({
    available: Schema.Literal(true),
    records: Schema.Array(RunRecord),
  }),
]);

const DepcruiseData = Schema.Any as unknown as Schema.Codec<DepcruiseVizData>;

const RunDepcruiseSuccess = Schema.Union([
  Schema.Struct({ available: Schema.Literal(false) }),
  Schema.Struct({
    available: Schema.Literal(true),
    data: DepcruiseData,
  }),
]);

/**
 * The two path-driven DevTools procedures. Each accepts an absolute package
 * directory and returns a discriminated availability union: `{ available:
 * false }` when the tool is not configured for that path, otherwise the full
 * ready-to-render payload.
 */
export const DevtoolsRpc = RpcGroup.make(
  Rpc.make('RunVtestDocs', {
    payload: { path: Schema.String },
    success: RunVtestSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('RunVtestRun', {
    payload: { path: Schema.String },
    success: RunVtestRunSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('RunDepcruise', {
    payload: { path: Schema.String },
    success: RunDepcruiseSuccess,
    error: DevtoolsRpcError,
  }),
);
