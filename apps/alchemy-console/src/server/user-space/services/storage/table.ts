import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema, ESchema } from '@kestack/std-toolkit/eschema';
import { Provider } from '../../../../shared/contracts/credential/index.ts';
import {
  AccountType,
  ReturnTo,
} from '../../../../shared/contracts/github/index.ts';
import { Member } from '../../../../shared/contracts/member/index.ts';
import {
  RunKind,
  RunnerEvent,
  RunResult,
  RunStatus,
  RunTrigger,
} from '../../../../shared/contracts/run/index.ts';

/*
 * The one table every User Space keeps on its own SQLite: a user's records
 * live only in their own Durable Object. Each entity is defined here, beside
 * the table, and its names are stored, so they never change.
 */

export const userSpaceTable = StdTable.make('user-space')
  .primary('pk', 'sk')
  .build();

/** Who this User Space belongs to, as last verified: unknown until their first call. */
const Owner = ESchema.make('Owner', {
  member: Schema.NullOr(Member),
  /** When the Worker verified them so, in milliseconds since the epoch. */
  at: Schema.Number,
}).build();

export const owner = userSpaceTable
  .singleEntity(Owner)
  .default({ member: null, at: 0 });

/** A Provider credential: its secret only ever as the Vault sealed it. */
const Credential = EntityESchema.make('Credential', 'credentialId', {
  name: Schema.String,
  provider: Provider,
  accountId: Schema.String,
  accountName: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
  /** The provider's keys as JSON, sealed by the Vault. */
  sealed: Schema.String,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}).build();

export type StoredCredential = typeof Credential.Type;

/** Every credential is the owner's, so they share one partition. */
export const credential = userSpaceTable
  .entity(Credential)
  .primary({ pk: [] })
  .build();

/** A repository a GitHub connection reaches, as last fetched. */
const StoredRepository = Schema.Struct({
  fullName: Schema.String,
  private: Schema.Boolean,
  defaultBranch: Schema.String,
});

/** A GitHub connection: one App installation, and the repositories it reaches. */
const GitHubConnection = EntityESchema.make(
  'GitHubConnection',
  'connectionId',
  {
    installationId: Schema.Number,
    accountLogin: Schema.String,
    accountType: AccountType,
    avatarUrl: Schema.String,
    repositories: Schema.Array(StoredRepository),
    createdAt: Schema.Number,
    updatedAt: Schema.Number,
  },
).build();

export type StoredConnection = typeof GitHubConnection.Type;

export const gitHubConnection = userSpaceTable
  .entity(GitHubConnection)
  .primary({ pk: [] })
  .build();

/**
 * A one-time `state` GitHub carries back: on an install URL, or on the
 * question of who the member is on GitHub, for one installation.
 */
const InstallState = EntityESchema.make('InstallState', 'state', {
  kind: Schema.Literals(['install', 'authorize']),
  /** The installation an `authorize` state is for; null for `install`. */
  installationId: Schema.NullOr(Schema.Number),
  returnTo: ReturnTo,
  /** In milliseconds since the epoch. */
  issuedAt: Schema.Number,
}).build();

export type StoredInstallState = typeof InstallState.Type;

export const installState = userSpaceTable
  .entity(InstallState)
  .primary({ pk: [] })
  .build();

/**
 * A Run as the User Space keeps it: what its owner's tabs see of it, and
 * what only the User Space needs to perform it. Nothing secret is kept: the
 * GitHub token and provider credentials are made for the runner when it
 * asks, from the connection and the credentials named here.
 */
const StoredRun = EntityESchema.make('Run', 'runId', {
  projectId: Schema.NullOr(Schema.String),
  stage: Schema.String,
  kind: RunKind,
  commit: Schema.String,
  trigger: RunTrigger,
  status: RunStatus,
  repo: Schema.String,
  folder: Schema.String,
  cancelRequested: Schema.Boolean,
  queuedAt: Schema.Number,
  startedAt: Schema.NullOr(Schema.Number),
  finishedAt: Schema.NullOr(Schema.Number),
  result: Schema.NullOr(RunResult),
  /** The GitHub connection whose installation reads `repo`. */
  connectionId: Schema.String,
  setupCommand: Schema.NullOr(Schema.String),
  /** The stack's entrypoint inside `folder`. */
  entrypoint: Schema.String,
  /** Provider → credentialId, opened for the runner when it asks. */
  credentials: Schema.Record(Schema.String, Schema.String),
  /** Which runs take turns with it: one stage's, or this one alone. */
  lane: Schema.String,
  /** When the runner was last heard from; null before it starts. */
  lastHeardAt: Schema.NullOr(Schema.Number),
  /** The highest `seq` stored of its events, and of its log batches. */
  lastEventSeq: Schema.Number,
  lastLogSeq: Schema.Number,
}).build();

export type StoredRun = typeof StoredRun.Type;

export const run = userSpaceTable.entity(StoredRun).primary({ pk: [] }).build();

/** A run's step, written once per `(runId, seq)`. */
const StoredRunEvent = EntityESchema.make('RunEvent', 'key', {
  runId: Schema.String,
  seq: Schema.Number,
  at: Schema.Number,
  event: RunnerEvent,
}).build();

export type StoredRunEvent = typeof StoredRunEvent.Type;

export const runEvent = userSpaceTable
  .entity(StoredRunEvent)
  .primary({ pk: ['runId'] })
  .build();

/** A run's batch of log lines, written once per `(runId, seq)`. */
const StoredRunLog = EntityESchema.make('RunLog', 'key', {
  runId: Schema.String,
  seq: Schema.Number,
  at: Schema.Number,
  lines: Schema.Array(Schema.String),
}).build();

export type StoredRunLog = typeof StoredRunLog.Type;

export const runLog = userSpaceTable
  .entity(StoredRunLog)
  .primary({ pk: ['runId'] })
  .build();

/**
 * Runs that take turns: the one running and the newest one waiting. A
 * stage's lane lives as long as the stage has a run; an Inspect's only as
 * long as the Inspect.
 */
const StoredLane = EntityESchema.make('RunLane', 'lane', {
  current: Schema.NullOr(Schema.String),
  waiting: Schema.NullOr(Schema.String),
}).build();

export type StoredLane = typeof StoredLane.Type;

export const runLane = userSpaceTable
  .entity(StoredLane)
  .primary({ pk: [] })
  .build();
