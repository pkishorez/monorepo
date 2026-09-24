import { DevtoolsToolRpc, GitRpc, MonoverseRpc } from '../rpc/index.js';
import { analyzeLaymosProject } from './analyze-laymos-project/index.js';
import { analyzeMonorepo } from './analyze-monorepo/index.js';
import { getLaymosDocumentation } from './get-laymos-documentation/index.js';
import { getLaymosModuleSource } from './get-laymos-module-source/index.js';
import { getLaymosSourceFiles } from './get-laymos-source-files/index.js';
import { getLaymosStories } from './get-laymos-stories/index.js';
import { getPackageFiles } from './get-package-files/index.js';
import { getPackageReadme } from './get-package-readme/index.js';
import {
  getBranches,
  getChanges,
  getFileDiff,
  getKnownFiles,
} from './git-changes/index.js';
import { runLaymosStories } from './run-laymos-stories/index.js';

export const DevtoolsHandlersLive = DevtoolsToolRpc.toLayer({
  AnalyzeLaymosProject: ({ projectPath }) => analyzeLaymosProject(projectPath),
  GetLaymosModuleSource: ({ projectPath, modulePath }) =>
    getLaymosModuleSource(projectPath, modulePath),
  GetLaymosDocumentation: ({ projectPath, scope }) =>
    getLaymosDocumentation(projectPath, scope),
  GetLaymosSourceFiles: ({ projectPath, pathPrefixes }) =>
    getLaymosSourceFiles(projectPath, pathPrefixes),
  GetLaymosStories: ({ projectPath }) => getLaymosStories(projectPath),
  RunLaymosStories: ({ projectPath, scope }) =>
    runLaymosStories(projectPath, scope),
});

export const MonoverseHandlersLive = MonoverseRpc.toLayer({
  AnalyzeMonorepo: ({ monorepoPath }) => analyzeMonorepo(monorepoPath),
  GetPackageReadme: ({ monorepoRoot, packagePath, relativePath }) =>
    getPackageReadme(monorepoRoot, packagePath, relativePath),
  GetPackageFiles: ({ monorepoRoot, packagePath }) =>
    getPackageFiles(monorepoRoot, packagePath),
});

export const GitHandlersLive = GitRpc.toLayer({
  GetBranches: ({ folder }) => getBranches(folder),
  GetChanges: ({ folder, baseRef }) => getChanges(folder, baseRef),
  GetFileDiff: ({ folder, path, baseRef }) =>
    getFileDiff(folder, path, baseRef),
  GetKnownFiles: ({ folder }) => getKnownFiles(folder),
});
