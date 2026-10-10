import { DevtoolsToolRpc, GitRpc, MonoverseRpc } from '../rpc/index.js';
import { analyzeLaymosProject } from './analyze-laymos-project/index.js';
import { analyzeMonorepo } from './analyze-monorepo/index.js';
import { getLaymosFile, getLaymosFileList } from './get-laymos-files/index.js';
import { getLaymosStories } from './get-laymos-stories/index.js';
import { getLaymosStoryReports } from './get-laymos-story-reports/index.js';
import { getMonorepoFile } from './get-monorepo-file/index.js';
import {
  getBranches,
  getChanges,
  getFileDiff,
  getKnownFiles,
} from './git-changes/index.js';
import { runLaymosStories } from './run-laymos-stories/index.js';

export const DevtoolsHandlersLive = DevtoolsToolRpc.toLayer({
  AnalyzeLaymosProject: ({ projectPath }) => analyzeLaymosProject(projectPath),
  GetLaymosFileList: ({ projectPath, modulePath }) =>
    getLaymosFileList(projectPath, modulePath),
  GetLaymosFile: ({ projectPath, path }) => getLaymosFile(projectPath, path),
  GetLaymosStories: ({ projectPath }) => getLaymosStories(projectPath),
  GetLaymosStoryReports: ({ projectPath }) =>
    getLaymosStoryReports(projectPath),
  RunLaymosStories: ({ projectPath, scope }) =>
    runLaymosStories(projectPath, scope),
});

export const MonoverseHandlersLive = MonoverseRpc.toLayer({
  AnalyzeMonorepo: ({ monorepoPath }) => analyzeMonorepo(monorepoPath),
  GetMonorepoFile: ({ monorepoRoot, path }) =>
    getMonorepoFile(monorepoRoot, path),
});

export const GitHandlersLive = GitRpc.toLayer({
  GetBranches: ({ folder }) => getBranches(folder),
  GetChanges: ({ folder, baseRef }) => getChanges(folder, baseRef),
  GetFileDiff: ({ folder, path, baseRef }) =>
    getFileDiff(folder, path, baseRef),
  GetKnownFiles: ({ folder }) => getKnownFiles(folder),
});
