export {
  configFile,
  isChecked,
  matches,
  parseConfig,
  presets,
} from './shared/config/index.ts';
export {
  checkProject,
  isSource,
  openProject,
  sourceExtensions,
} from './project/index.ts';
export {
  indexFiles,
  isIndexFile,
  isInside,
  joinPath,
  listTree,
  parentOf,
  relativeTo,
} from './shared/tree/index.ts';

export type {
  Config,
  ConfigResult,
  Pass,
  PresetName,
  Rules,
} from './shared/config/index.ts';
export { type ContractsRule } from './shared/contracts/index.ts';
export { type ImportsRule } from './shared/imports/index.ts';
export type {
  CheckOptions,
  Excepted,
  Import,
  OpenProject,
  PackageReport,
  PackageResult,
  Project,
  Violation,
  ViolationKind,
} from './project/index.ts';
export type { Tree } from './shared/tree/index.ts';
