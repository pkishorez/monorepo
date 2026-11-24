import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { ProjectsRpc } from '../contract/index.js';
import { listFolders } from './folders.js';
import { addProject, listProjects, removeProject } from './project-registry.js';

/**
 * Fulfils the picker's RPC: the Project registry over the Project store,
 * and the folders walked from `home` down (the user's home by default).
 */
export const projectsRpcLayer = (home: string = homedir()) =>
  ProjectsRpc.toLayer({
    ListProjects: () => listProjects(),
    AddProject: ({ path }) => addProject(path),
    RemoveProject: ({ id }) => removeProject(id),
    ListFolders: (input) => listFolders(resolve(home), input),
  });
