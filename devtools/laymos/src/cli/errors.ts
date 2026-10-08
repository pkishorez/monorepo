import { ConfigError } from '../services/config/index.js';
import { CruiseError } from '../services/file-cruiser/index.js';
import { StoriesError } from '../orchestrator/run-stories/index.js';
import { InspectionTargetNotFound } from '../orchestrator/inspect/index.js';

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
    return error.targetKind === 'file'
      ? `File is not an analyzed source file: ${error.target}`
      : `No Module or Wrapper at: ${error.target}`;
  }
  if (error instanceof StoriesError) return renderStoriesError(error);
  return error instanceof Error ? error.message : String(error);
}

function renderStoriesError(error: StoriesError): string {
  switch (error.reason) {
    case 'no-stories-path':
      return `The config sets no storiesPath: ${error.path}`;
    case 'load':
      return [
        `Could not load: ${error.path}`,
        error.cause instanceof Error
          ? error.cause.message
          : String(error.cause),
      ].join('\n');
    case 'invalid-proof':
      return `A Proof file must default-export a Proof: ${error.path}`;
    case 'unknown-scope':
      return `No Story or Proof has the id: ${error.path}`;
    case 'invalid-timeout':
      return `storyTimeout is not a Duration: ${String(error.cause)}`;
  }
}
