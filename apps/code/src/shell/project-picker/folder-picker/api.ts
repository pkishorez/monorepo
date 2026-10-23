import { Effect } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { reasonOf } from '../../../refusal/index.ts';

/*
 * What the folder Steps ask of a Machine, over its own socket: a folder's
 * sub-folders, a new folder with `git init`, and a folder added as a
 * Project, the one it already is, if it is. Each refusal is a sentence to
 * show in the Step.
 */

/** The sub-folders of `path`, those holding `query` when one is given. */
export const listFolder = (machineId: string, path: string, query: string) =>
  AiClients.on(
    machineId,
    AiClient.use((api) =>
      api.listFolder(query === '' ? { path } : { path, query }),
    ),
  ).pipe(Effect.mapError(reasonOf));

/** Makes the folder `name` in `parent`, with `git init`. */
export const createFolder = (machineId: string, parent: string, name: string) =>
  AiClients.on(
    machineId,
    AiClient.use((api) => api.createFolder({ parent, name })),
  ).pipe(Effect.mapError(reasonOf));

/** The Project at `path`: added, or the one it already is. */
export const addProject = (machineId: string, path: string) =>
  AiClients.on(
    machineId,
    AiClient.use((api) => api.addProject({ path })),
  ).pipe(Effect.mapError(reasonOf));
