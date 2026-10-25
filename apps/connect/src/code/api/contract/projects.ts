import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ProjectSchema } from '../records/index.js';
import { FolderNotFound, ProjectNotFound } from './errors.js';
import { Batch, Cursor } from './wire.js';

/* Folders added as Projects. */

export const ProjectValue = Schema.Struct(ProjectSchema.fields);

export const ProjectsRpc = RpcGroup.make(
  /**
   * Adds a folder as a Project, its symlinks resolved so one folder is one
   * Project; the one already added for it, if any.
   */
  Rpc.make('addProject', {
    payload: { path: Schema.String },
    success: ProjectValue,
    error: FolderNotFound,
  }),
  /** Removes a Project; its folder is never touched. */
  Rpc.make('removeProject', {
    payload: { id: Schema.String },
    error: ProjectNotFound,
  }),
  /** Every Project changed after the cursor, then each change live. */
  Rpc.make('projects', { payload: Cursor, success: Batch, stream: true }),
);
