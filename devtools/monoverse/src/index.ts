/*
 * Monoverse's rules, for any tool that reads a codebase: the lint runs
 * them file by file, the DevTools over a whole branch. Nothing here
 * depends on oxlint.
 */

export {
  type Config,
  type ConfigResult,
  type PresetName,
  type Rules,
  configFile,
  isChecked,
  parseConfig,
  presets,
} from './shared/config/index.ts';
export {
  type ContractFinding,
  type ContractsRule,
  contractClass,
  contractFindings,
  contractMessages,
  contractOf,
  missingContract,
} from './shared/contracts/index.ts';
export { type EsNode } from './shared/estree/index.ts';
export {
  type ImportStatement,
  type ImportVerdict,
  type ImportsRule,
  checkImport,
  importMessage,
  importOf,
  importsIn,
  judgeImport,
} from './shared/imports/index.ts';
export {
  isRelative,
  resolveRelative,
  sourceExtensions,
} from './shared/resolve/index.ts';
export {
  type Tree,
  diskTree,
  indexFiles,
  isIndexFile,
  isInside,
  joinPath,
  listTree,
  parentOf,
  relativeTo,
} from './shared/tree/index.ts';
