import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import {
  CredentialSummary,
  Provider,
} from '../../contracts/credential/index.ts';
import { Repository } from '../../contracts/github/index.ts';
import {
  InspectResult,
  RunPhase,
  RunUpdate,
} from '../../contracts/run/index.ts';
import { Api } from '../capabilities/index.ts';

/**
 * New project, at `/new`: one screen that walks a member from a repository
 * to Production deploying, one step at a time, each with one thing to do.
 *
 *   PickRepo     search the repositories of every connection
 *   ChooseFolder the folders holding an `alchemy.run.ts`, the root first
 *   Inspecting   Console reads the folder's stack, live
 *   Providers    a credential for each provider the stack uses
 *   Deploying    the project is made; then off to its Production run
 *
 * Drawn by the Worker with the repositories and credentials in it, then
 * followed live, so a connection or credential added elsewhere shows here.
 */

/** The repository a project is being made from. */
export const Target = Schema.Struct({
  connectionId: Schema.String,
  /** `owner/name`. */
  repo: Schema.String,
  defaultBranch: Schema.String,
});

export const NewProjectStep = Schema.TaggedUnion({
  PickRepo: {},
  ChooseFolder: { target: Target },
  Inspecting: {
    target: Target,
    folder: Schema.String,
    /** Null until the Inspect is asked for and answered. */
    runId: Schema.NullOr(Schema.String),
  },
  Providers: {
    target: Target,
    folder: Schema.String,
    runId: Schema.String,
    inspect: InspectResult,
  },
  Deploying: {
    target: Target,
    folder: Schema.String,
    runId: Schema.String,
    inspect: InspectResult,
  },
});

export const NewProject = Page.define({
  path: '/new',
  metadata: { title: 'New project · Alchemy Console' },
  data: Schema.Struct({
    // Each null for a visitor Console turns away.
    repositories: Schema.NullOr(Schema.Array(Repository)),
    credentials: Schema.NullOr(Schema.Array(CredentialSummary)),
  }),
  requires: [Api],
  state: NewProjectStep,
  model: Schema.Struct({
    /** As the User Space last said; null until it has. */
    repositories: Schema.NullOr(Schema.Array(Repository)),
    credentials: Schema.NullOr(Schema.Array(CredentialSummary)),
    /** What the repository search holds. */
    query: Schema.String,
    /** The chosen repository's project folders; null while they are found. */
    folders: Schema.NullOr(Schema.Array(Schema.String)),
    /** The folder picked, before it is inspected. */
    folder: Schema.NullOr(Schema.String),
    /** The Inspect's latest step, and the lines it wrote. */
    phase: Schema.NullOr(RunPhase),
    lines: Schema.Array(Schema.String),
    /** The highest event and log `seq` heard of the Inspect. */
    heard: Schema.Struct({ events: Schema.Number, logs: Schema.Number }),
    /** Provider → the credential picked for Production. */
    choices: Schema.Record(Schema.String, Schema.String),
    /** The add-credential sheet is open for this provider. */
    adding: Schema.NullOr(Provider),
    /** An errand under way: finding folders, starting the Inspect, making the project. */
    busy: Schema.Boolean,
    /** Why the step failed, until the next try. */
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    RepositoriesSeen: { repositories: Schema.Array(Repository) },
    CredentialsSeen: { credentials: Schema.Array(CredentialSummary) },
    QueryTyped: { query: Schema.String },
    RepoChosen: { target: Target },
    FoldersFound: { repo: Schema.String, folders: Schema.Array(Schema.String) },
    FolderChosen: { folder: Schema.String },
    InspectChosen: {},
    InspectStarted: { runId: Schema.String },
    InspectHeard: { update: RunUpdate },
    CredentialChosen: { provider: Schema.String, credentialId: Schema.String },
    AddCredentialChosen: { provider: Provider },
    AddCredentialClosed: {},
    CredentialAdded: { credentialId: Schema.String },
    DeployChosen: {},
    Created: { projectId: Schema.String, runId: Schema.String },
    BackChosen: {},
    Failed: { message: Schema.String },
  }),
});
