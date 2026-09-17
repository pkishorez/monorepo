// Node consumers use this high-level capability to produce a Monorepo analysis.
export {
  analyzeMonorepo,
  InvalidMonorepoPath,
  ManifestError,
  MonorepoReadError,
} from './analyze-monorepo/index.js';
export type { AnalyzeMonorepoError } from './analyze-monorepo/index.js';
// Renderers and transports name the analysis they consume.
export {
  DependencyKindSchema,
  MonorepoAnalysisSchema,
  PackageCycleViolationSchema,
  PackageDependencySchema,
  PackageSchema,
} from './domain/schema/index.js';
export type {
  DependencyKind,
  MonorepoAnalysis,
  Package,
  PackageCycleViolation,
  PackageDependency,
} from './domain/schema/index.js';
