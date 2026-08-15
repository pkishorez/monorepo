import { ConfigError } from '../services/config/index.js';
import { CruiseError } from '../services/file-cruiser/index.js';
import {
  InspectionTargetNotFound,
  ModuleInspectionCycle,
} from '../orchestrator/inspect/index.js';

export function renderOperationalError(error: unknown): string {
  if (error instanceof ConfigError) {
    if (error.reason === 'validation') {
      return [
        `Invalid config: ${error.filePath}`,
        ...error.issues.map((issue) => `  ✕ ${issue.message}`),
      ].join('\n');
    }
    return `Could not ${error.reason} config: ${error.filePath}`;
  }
  if (error instanceof CruiseError) {
    return `Could not analyze source files beneath: ${error.baseDir}`;
  }
  if (error instanceof InspectionTargetNotFound) {
    if (error.targetKind === 'file') {
      return `File is not an included supported source file: ${error.target}`;
    }
    return error.targetKind === 'layer'
      ? `Layer not found: ${error.target}`
      : `Configured Module not found: ${error.target}`;
  }
  if (error instanceof ModuleInspectionCycle) {
    return [
      `Cannot show dependencies for ${error.target}:`,
      'the Module participates in a dependency cycle.',
      '',
      'Run `laymos lint modules` for details.',
    ].join('\n');
  }
  return error instanceof Error ? error.message : String(error);
}
