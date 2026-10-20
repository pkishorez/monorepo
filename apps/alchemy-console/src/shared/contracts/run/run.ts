import { Schema } from 'effect';

/*
 * A Run as everyone who speaks of one sees it: the browser watching it, the
 * User Space keeping it, and the runner performing it. A Run is one Inspect,
 * Deploy or Destroy of a project's own code at one commit against one stage;
 * a Run event is one step the runner reported, in the order it reported it.
 */

export const RunKind = Schema.Literals(['inspect', 'deploy', 'destroy']);
export type RunKind = typeof RunKind.Type;

export const RunStatus = Schema.Literals([
  /** Waiting for the stage's current run to end. */
  'queued',
  /** Checking out, setting up and reading the stack: every run begins so. */
  'inspecting',
  'planning',
  'applying',
  'succeeded',
  'failed',
  /** Cancelled before it ran, replaced by a newer commit, or stopped on request. */
  'cancelled',
  /** The runner stopped reporting. */
  'lost',
]);
export type RunStatus = typeof RunStatus.Type;

/** A run that is over: nothing more is heard from it. */
export const isFinished = (status: RunStatus) =>
  status === 'succeeded' ||
  status === 'failed' ||
  status === 'cancelled' ||
  status === 'lost';

/** What started a run. */
export const RunTrigger = Schema.Literals(['user', 'push', 'pull-request']);
export type RunTrigger = typeof RunTrigger.Type;

/** What an Inspect read from the project's own stack. */
export const InspectResult = Schema.Struct({
  /** The name the project's `alchemy.run.ts` gives its stack. */
  stackName: Schema.String,
  /** Where the stack keeps its state: Console deploys only from Cloudflare state. */
  stateStore: Schema.Union([
    Schema.Literal('cloudflare'),
    Schema.Struct({ other: Schema.String }),
  ]),
  /** The providers the stack registers, lowercase: `cloudflare`, `aws`, … */
  providers: Schema.Array(Schema.String),
  /** The Alchemy version the commit installs. */
  alchemyVersion: Schema.String,
});
export type InspectResult = typeof InspectResult.Type;

/** A step of a run, as the runner names it. */
export const RunPhase = Schema.Literals([
  'cloning',
  'setup',
  'inspecting',
  /** A Deploy or Destroy working out what to change. */
  'planning',
  /** A Deploy or Destroy changing it. */
  'applying',
]);
export type RunPhase = typeof RunPhase.Type;

/** One resource or action a plan names, and what the plan does to it. */
export const PlannedResource = Schema.Struct({
  /** Its fully qualified name: what its status events name too. */
  fqn: Schema.String,
  logicalId: Schema.String,
  /** `Cloudflare.Worker`, `Sandbox.Marker`, … */
  resourceType: Schema.String,
  /** `create`, `update`, `replace`, `delete`, `noop`, … as Alchemy plans it. */
  action: Schema.String,
});
export type PlannedResource = typeof PlannedResource.Type;

// Stored as written: plain structs with a literal `_tag`, no constructor defaults.
const tagged = <Tag extends string, Fields extends Schema.Struct.Fields>(
  tag: Tag,
  fields: Fields,
) => Schema.Struct({ _tag: Schema.Literal(tag), ...fields });

/** One reported step of a run. */
export const RunnerEvent = Schema.Union([
  tagged('Phase', { phase: RunPhase }),
  tagged('Inspected', { result: InspectResult }),
  /** What the plan will do, before it does any of it. */
  tagged('Planned', { resources: Schema.Array(PlannedResource) }),
  /** One resource moved on: `creating`, `created`, `fail`, … as Alchemy says. */
  tagged('ResourceStatus', {
    fqn: Schema.String,
    logicalId: Schema.String,
    resourceType: Schema.String,
    status: Schema.String,
    message: Schema.NullOr(Schema.String),
  }),
]);
export type RunnerEvent = typeof RunnerEvent.Type;

/** How a run ended, as the runner tells it. */
export const RunResult = Schema.Union([
  /** An Inspect that read the stack. */
  tagged('Succeeded', { inspect: InspectResult }),
  /**
   * A Deploy that applied its plan: the stack it read, and the stage's
   * outputs, each as text (`url` → `https://…`).
   */
  tagged('Deployed', {
    inspect: InspectResult,
    outputs: Schema.Record(Schema.String, Schema.String),
  }),
  tagged('Failed', { message: Schema.String }),
  tagged('Cancelled', {}),
]);
export type RunResult = typeof RunResult.Type;

/** A run, as its owner's tabs see it. */
export const Run = Schema.Struct({
  runId: Schema.String,
  /** The project it runs for; null for an Inspect before a project exists. */
  projectId: Schema.NullOr(Schema.String),
  stage: Schema.String,
  kind: RunKind,
  /** The full SHA of the commit it runs. */
  commit: Schema.String,
  trigger: RunTrigger,
  status: RunStatus,
  /** `owner/name`. */
  repo: Schema.String,
  /** The folder holding `alchemy.run.ts`, from the repository's root; `.` for the root. */
  folder: Schema.String,
  /** True once cancelling it was asked for, until it ends. */
  cancelRequested: Schema.Boolean,
  /** In milliseconds since the epoch. */
  queuedAt: Schema.Number,
  startedAt: Schema.NullOr(Schema.Number),
  finishedAt: Schema.NullOr(Schema.Number),
  /** How it ended; null until it does. `lost` and a timeout say why as `Failed`. */
  result: Schema.NullOr(RunResult),
});
export type Run = typeof Run.Type;

/** One reported step, numbered from 1 in the order the runner reported it. */
export const RunEvent = Schema.Struct({
  runId: Schema.String,
  seq: Schema.Number,
  at: Schema.Number,
  event: RunnerEvent,
});
export type RunEvent = typeof RunEvent.Type;

/** Lines the run's processes wrote, numbered from 1 in the order the runner sent them. */
export const RunLog = Schema.Struct({
  runId: Schema.String,
  seq: Schema.Number,
  at: Schema.Number,
  lines: Schema.Array(Schema.String),
});
export type RunLog = typeof RunLog.Type;

/** What a watcher of one run hears: the run as it is, and its new events and logs. */
export const RunUpdate = Schema.Union([
  tagged('Run', { run: Run }),
  tagged('Events', { events: Schema.Array(RunEvent) }),
  tagged('Logs', { logs: Schema.Array(RunLog) }),
]);
export type RunUpdate = typeof RunUpdate.Type;

/** Why a call about a run was refused. */
export class RunError extends Schema.Error<RunError>(
  'alchemy-console/RunError',
)({
  _tag: Schema.tag('RunError'),
  reason: Schema.Literals([
    /** No such run, connection or repository. */
    'not-found',
    /** The input can't be run: a folder outside the repository, say. */
    'invalid',
    /** The run is over; nothing more is taken from it. */
    'finished',
  ]),
  message: Schema.String,
}) {}

/** Everything the runner needs to perform one run, the GitHub token minted for it alone. */
export const RunSpec = Schema.Struct({
  runId: Schema.String,
  kind: RunKind,
  /** `owner/name`. */
  repo: Schema.String,
  /** The full SHA to check out. */
  commit: Schema.String,
  /** From the repository's root; `.` for the root. */
  folder: Schema.String,
  /** Run instead of the install the lockfile implies; null for that install. */
  setupCommand: Schema.NullOr(Schema.String),
  stage: Schema.String,
  /** The stack's entrypoint inside `folder`. */
  entrypoint: Schema.String,
  /** A GitHub installation token, good for an hour, that reads this repository. */
  githubToken: Schema.String,
});
export type RunSpec = typeof RunSpec.Type;
