export {
  detectUnpinnedVersions,
  type ViolationUnpinnedVersion,
} from './unpinned-versions.js';
export {
  detectVersionMismatches,
  type ViolationVersionMismatch,
} from './version-mismatch.js';
export {
  detectFormatPackageJson,
  type ViolationFormatPackageJson,
} from './format-package-json.js';
export {
  detectDuplicateWorkspaces,
  type ViolationDuplicateWorkspace,
} from './duplicate-workspace.js';

import type { ViolationUnpinnedVersion } from './unpinned-versions.js';
import type { ViolationVersionMismatch } from './version-mismatch.js';
import type { ViolationFormatPackageJson } from './format-package-json.js';
import type { ViolationDuplicateWorkspace } from './duplicate-workspace.js';

export type Violation =
  | ViolationUnpinnedVersion
  | ViolationVersionMismatch
  | ViolationFormatPackageJson
  | ViolationDuplicateWorkspace;
