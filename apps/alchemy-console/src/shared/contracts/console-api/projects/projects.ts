import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { GitHubError } from '../../github/index.ts';
import {
  CreatedProject,
  NewProject,
  ProjectDetail,
  ProjectError,
  ProjectSummary,
} from '../../project/index.ts';
import { RunError } from '../../run/index.ts';

/**
 * The caller's projects. `list` gives every project with its Production
 * stage, at once and again after each change; `get` one project with its
 * stages and each stage's latest run, live, so every open tab sees a deploy
 * move on. `create` makes a project from a folder an Inspect read, with a
 * credential for each provider the Inspect found, and deploys Production at
 * once: it answers the project and that run.
 */
export const Projects = RpcGroup.make(
  Rpc.make('list', { success: Schema.Array(ProjectSummary), stream: true }),
  Rpc.make('get', {
    payload: { projectId: Schema.String },
    success: ProjectDetail,
    error: ProjectError,
    stream: true,
  }),
  Rpc.make('create', {
    payload: NewProject,
    success: CreatedProject,
    error: Schema.Union([ProjectError, GitHubError, RunError]),
  }),
).prefix('Projects.');
