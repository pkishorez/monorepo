// Node consumers use this high-level capability to produce a Monorepo analysis.
export { analyzeMonorepo } from './analyze-monorepo.js';
export type { AnalyzeMonorepoError } from './analyze-monorepo.js';
export { InvalidMonorepoPath } from './errors.js';
// Callers distinguish workspace and manifest reading failures.
export {
  ManifestError,
  MonorepoReadError,
} from '../services/monorepo/index.js';
