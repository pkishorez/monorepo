import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { ProjectSchema } from '../../records/index.js';
import { FolderNotFound, ProjectNotFound } from './errors.js';
import { Batch, Cursor } from './wire.js';

/* Folders added as Projects. */

/** A Project as a reply carries it, with its version. */
export const ProjectValue = ProjectSchema.schema;

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
  /** Every Project changed after the cursor, then each change live. */
  Rpc.make('projects', {
    payload: Cursor.schema,
    success: Batch,
    stream: true,
  }),
);
