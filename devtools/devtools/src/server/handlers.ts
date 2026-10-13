import { LaymosRpc } from '../rpc/laymos/index.js';
import { GitRpc } from '../rpc/git/index.js';
import { MonoverseRpc } from '../rpc/monoverse/index.js';
import { analyzeLaymosProject } from './laymos/analyze-project/index.js';
import { analyzeMonorepo } from './monoverse/analyze-monorepo/index.js';
import { getLaymosFile, getLaymosFileList } from './laymos/get-files/index.js';
import { getLaymosStories } from './laymos/get-stories/index.js';
import { getLaymosStoryReports } from './laymos/get-story-reports/index.js';
import { getMonorepoFile } from './monoverse/get-monorepo-file/index.js';
import {
  getBranches,
  getChanges,
  getFileDiff,
  getKnownFiles,
} from './git-changes/index.js';
import { runLaymosStories } from './laymos/run-stories/index.js';

export const DevtoolsHandlersLive = LaymosRpc.toLayer({
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
