import { DevtoolsToolRpc, MonoverseRpc } from '../rpc/index.js';
import { analyzeLaymosProject } from './analyze-laymos-project/index.js';
import { analyzeMonorepo } from './analyze-monorepo/index.js';
import {
  getLaymosBranches,
  getLaymosChanges,
  getLaymosFileDiff,
} from './get-laymos-changes/index.js';
import { getLaymosDocumentation } from './get-laymos-documentation/index.js';
import { getLaymosModuleSource } from './get-laymos-module-source/index.js';
import { getLaymosSourceFiles } from './get-laymos-source-files/index.js';
import { getLaymosStories } from './get-laymos-stories/index.js';
import { getPackageReadme } from './get-package-readme/index.js';
import { runLaymosStories } from './run-laymos-stories/index.js';

export const DevtoolsHandlersLive = DevtoolsToolRpc.toLayer({
  AnalyzeLaymosProject: ({ projectPath }) => analyzeLaymosProject(projectPath),
  GetLaymosModuleSource: ({ projectPath, modulePath }) =>
    getLaymosModuleSource(projectPath, modulePath),
  GetLaymosDocumentation: ({ projectPath, scope }) =>
    getLaymosDocumentation(projectPath, scope),
  GetLaymosSourceFiles: ({ projectPath, pathPrefixes }) =>
    getLaymosSourceFiles(projectPath, pathPrefixes),
  GetLaymosBranches: ({ projectPath }) => getLaymosBranches(projectPath),
  GetLaymosChanges: ({ projectPath, baseRef }) =>
    getLaymosChanges(projectPath, baseRef),
  GetLaymosFileDiff: ({ projectPath, path, baseRef }) =>
    getLaymosFileDiff(projectPath, path, baseRef),
  GetLaymosStories: ({ projectPath }) => getLaymosStories(projectPath),
  RunLaymosStories: ({ projectPath, scope }) =>
    runLaymosStories(projectPath, scope),
});

export const MonoverseHandlersLive = MonoverseRpc.toLayer({
  AnalyzeMonorepo: ({ monorepoPath }) => analyzeMonorepo(monorepoPath),
  GetPackageReadme: ({ monorepoRoot, packagePath, relativePath }) =>
    getPackageReadme(monorepoRoot, packagePath, relativePath),
});
