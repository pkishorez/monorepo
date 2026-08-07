import { ConfigError } from '../services/config/index.js';
import { CruiseError } from '../services/file-cruiser/index.js';
import { DepsTargetError } from '../orchestrator/deps/index.js';

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
  if (error instanceof DepsTargetError) {
    return `Target is outside the analysis universe: ${error.target}`;
  }
  return error instanceof Error ? error.message : String(error);
}
