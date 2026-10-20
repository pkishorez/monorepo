import { Schema } from 'effect';
import { Run } from '../run/index.ts';

/*
 * A Project as the browser sees it: one repository folder holding an
 * `alchemy.run.ts`, the stack it owns, and how each Environment deploys it.
 * A Stage is one deployed instance of that stack: `prod` for Production,
 * `pr<N>` for a pull request's Preview. Variable values never come back
 * out: the browser sees their names only.
 */

/** Which kind of deployment a stage is. */
export const EnvironmentName = Schema.Literals(['production', 'preview']);
export type EnvironmentName = typeof EnvironmentName.Type;

/** What an Environment deploys with: a credential per provider, and variables by name. */
export const Environment = Schema.Struct({
  /** Provider (`cloudflare`, `aws`) → credentialId. */
  credentials: Schema.Record(Schema.String, Schema.String),
  /** Write-only: the names alone. */
  variables: Schema.Array(Schema.Struct({ name: Schema.String })),
});
export type Environment = typeof Environment.Type;

/** Preview deploys as Production does, or with settings of its own. */
export const PreviewEnvironment = Schema.Union([
  Schema.Literal('same-as-production'),
  Environment,
]);

export const Project = Schema.Struct({
  projectId: Schema.String,
  /** The GitHub connection whose installation reads the repository. */
  connectionId: Schema.String,
  repo: Schema.Struct({
    /** GitHub's ID, which a rename keeps. */
    id: Schema.Number,
    /** `owner/name`. */
    fullName: Schema.String,
  }),
  /** From the repository's root; `.` for the root. */
  folder: Schema.String,
  /** Run instead of the install the lockfile implies; null for that install. */
  setupCommand: Schema.NullOr(Schema.String),
  /** Pushes to it deploy Production. */
  productionBranch: Schema.String,
  /** The name the project's `alchemy.run.ts` gives its stack. */
  stackName: Schema.String,
  production: Environment,
  preview: PreviewEnvironment,
  /** In milliseconds since the epoch. */
  createdAt: Schema.Number,
});
export type Project = typeof Project.Type;

export const StageStatus = Schema.Literals([
  'deploying',
  'live',
  'deploy-failed',
  'destroying',
  'destroy-failed',
]);
export type StageStatus = typeof StageStatus.Type;

export const Stage = Schema.Struct({
  projectId: Schema.String,
  /** The stage's name: `prod`, `pr12`. */
  name: Schema.String,
  environment: EnvironmentName,
  /** The pull request a Preview belongs to; null for Production. */
  pullRequest: Schema.NullOr(Schema.Number),
  /** The commit whose code last deployed it; null before its first deploy. */
  lastDeployedCommit: Schema.NullOr(Schema.String),
  status: StageStatus,
  /** The stack's outputs as last deployed, each as text. */
  outputs: Schema.Record(Schema.String, Schema.String),
  /** The run that last worked on it; null before any. */
  lastRunId: Schema.NullOr(Schema.String),
  /** In milliseconds since the epoch. */
  updatedAt: Schema.Number,
});
export type Stage = typeof Stage.Type;

/** A project as the projects list shows it: with its Production stage, once it has one. */
export const ProjectSummary = Schema.Struct({
  project: Project,
  production: Schema.NullOr(Stage),
});
export type ProjectSummary = typeof ProjectSummary.Type;

/** A project, its stages, and each stage's latest run. */
export const ProjectDetail = Schema.Struct({
  project: Project,
  stages: Schema.Array(Stage),
  /** Newest first. */
  runs: Schema.Array(Run),
});
export type ProjectDetail = typeof ProjectDetail.Type;

/** What `Projects.create` is asked: the folder an Inspect read, and how Production deploys. */
export const NewProject = Schema.Struct({
  connectionId: Schema.String,
  /** `owner/name`. */
  repo: Schema.String,
  /** From the repository's root; `.` for the root. */
  folder: Schema.String,
  setupCommand: Schema.NullOr(Schema.String),
  /** The repository's default branch when null. */
  productionBranch: Schema.NullOr(Schema.String),
  production: Schema.Struct({
    /** Provider → credentialId, one for each provider the Inspect found. */
    credentials: Schema.Record(Schema.String, Schema.String),
  }),
  /** The Inspect of this folder that read its stack: its name comes from it. */
  inspectRunId: Schema.String,
});
export type NewProject = typeof NewProject.Type;

/** A project made, and the run deploying its Production. */
export const CreatedProject = Schema.Struct({
  projectId: Schema.String,
  runId: Schema.String,
});

/** Why a call about a project was refused. */
export class ProjectError extends Schema.Error<ProjectError>(
  'alchemy-console/ProjectError',
)({
  _tag: Schema.tag('ProjectError'),
  reason: Schema.Literals([
    /** No such project, connection, repository or Inspect. */
    'not-found',
    /** It can't be made so: a credential missing, a folder another project has. */
    'invalid',
  ]),
  message: Schema.String,
}) {}

/** The providers Console can hand a run credentials for. */
export const SUPPORTED_PROVIDERS: ReadonlyArray<string> = ['cloudflare', 'aws'];

/** The stage Production deploys to. */
export const PRODUCTION_STAGE = 'prod';

const URL_LIKE = /^https?:\/\/\S+$/;

/** The stage's URL: its `url` output, else the first output that is one; null when none is. */
export const urlOf = (outputs: Readonly<Record<string, string>>) => {
  if (URL_LIKE.test(outputs.url ?? '')) return outputs.url!;
  return Object.values(outputs).find((value) => URL_LIKE.test(value)) ?? null;
};

/** What a project is called: its stack's name. */
export const nameOf = (project: Pick<Project, 'stackName'>) =>
  project.stackName;
