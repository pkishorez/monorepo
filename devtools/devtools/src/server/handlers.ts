import { DevtoolsToolRpc } from '../rpc/rpc.js';
import { analyzeLaymosProject } from './analyze-laymos-project/index.js';
import { getLaymosModuleSource } from './get-laymos-module-source/index.js';
import { getLaymosStories } from './get-laymos-stories/index.js';
import { runLaymosStories } from './run-laymos-stories/index.js';

export const DevtoolsHandlersLive = DevtoolsToolRpc.toLayer({
  AnalyzeLaymosProject: ({ projectPath }) => analyzeLaymosProject(projectPath),
  GetLaymosModuleSource: ({ projectPath, modulePath }) =>
    getLaymosModuleSource(projectPath, modulePath),
  GetLaymosStories: ({ projectPath }) => getLaymosStories(projectPath),
  RunLaymosStories: ({ projectPath, scope }) =>
    runLaymosStories(projectPath, scope),
});
