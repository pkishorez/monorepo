export {
  upsertDependency,
  type UpsertDependencyOptions,
} from './operations/upsert-dependency.js';

export { formatPackageJson } from './operations/format-package-json.js';

export {
  removeDependency,
  type RemoveDependencyOptions,
} from './operations/remove-dependency.js';

export {
  ModifyError,
  DependencyNotFoundError,
  PackageJsonParseError,
  PackageJsonWriteError,
} from './types.js';
