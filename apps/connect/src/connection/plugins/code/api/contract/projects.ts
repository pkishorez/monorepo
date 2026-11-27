import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';
import { ProjectSchema } from '../../records/index.js';
import { FolderNotFound, ProjectNotFound } from './errors.js';
import { Batch, Cursor, tagged } from './wire.js';

/* Folders added as Projects. */

/** A Project as a reply carries it, with its version. */
export const ProjectValue = ProjectSchema.schema;

/**
 * A Project's git branches, as a Branch Picker lists them; NotGit when its
 * folder is not a git repository, or git is missing or fails there.
 */
export const Branches = ValueESchema.make(
  'Branches',
  Schema.Union([
    tagged('NotGit', {}),
    tagged('Git', {
      /** The branch the Project's folder is on; null when it is on none. */
      current: Schema.NullOr(Schema.String),
      /** Every Worktree, the Project's folder first, with its branch, null when on none. */
      worktrees: Schema.Array(
        Schema.Struct({
          path: Schema.String,
          branch: Schema.NullOr(Schema.String),
        }),
      ),
      /** Every local branch, by name. */
      local: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          /** The Origin branch it tracks, as `origin/main`; null when none. */
          upstream: Schema.NullOr(Schema.String),
          /** The Worktree it is checked out in; null when none. */
          worktree: Schema.NullOr(Schema.String),
        }),
      ),
      /** Every Origin branch no local branch tracks, as `origin/main`. */
      origin: Schema.Array(Schema.String),
    }),
  ]),
).build();
export type Branches = typeof Branches.Type;

export const ProjectsRpc = RpcGroup.make(
  /**
   * Adds a folder as a Project, its symlinks resolved so one folder is one
   * Project; the one already added for it, if any.
   */
  Rpc.make('addProject', {
    payload: ESchema.make('AddProjectPayload', {
      path: Schema.String,
    }).build().schema,
    success: ProjectValue,
    error: FolderNotFound,
  }),
  /** Removes a Project; its folder is never touched. */
  Rpc.make('removeProject', {
    payload: ESchema.make('RemoveProjectPayload', {
      id: Schema.String,
    }).build().schema,
    error: ProjectNotFound,
  }),
  /**
   * The Project's branches as git has them now. Each call also starts one
   * fetch from Origin in the background, unless one runs for the Project
   * already, so the next call lists what Origin has.
   */
  Rpc.make('branches', {
    payload: ESchema.make('BranchesPayload', {
      projectId: Schema.String,
    }).build().schema,
    success: Branches.schema,
    error: ProjectNotFound,
  }),
  /** Every Project changed after the cursor, then each change live. */
  Rpc.make('projects', {
    payload: Cursor.schema,
    success: Batch,
    stream: true,
  }),
);
