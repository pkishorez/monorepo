import {
  findBoundaryAndDependencyViolations,
  type ImportFindings,
} from './boundaries.js';
import { findCoverageViolations } from './coverage.js';
import { findDeadModuleViolations } from './dead-modules.js';
import { findGraphCoverageViolations } from './graph-coverage.js';
import { findCycleViolations } from './cycles.js';
import { findEntryPointViolations } from './entry-points.js';
import { findUnusedSharedViolations } from './unused-shared.js';
import type { ModuleAnalysisContext, ModuleViolation } from '../modules.js';

interface ModuleFindings {
  readonly dependencies: ImportFindings['dependencies'];
  readonly violations: readonly ModuleViolation[];
}

export function findModuleViolations(
  context: ModuleAnalysisContext,
): ModuleFindings {
  const imports = findBoundaryAndDependencyViolations(context);
  return {
    dependencies: imports.dependencies,
    violations: [
      ...findCoverageViolations(context),
      ...findGraphCoverageViolations(context),
      ...findEntryPointViolations(context),
      ...imports.violations,
      ...findUnusedSharedViolations(context, imports.edges),
      ...findDeadModuleViolations(context, imports.edges),
      ...findCycleViolations(imports.edges),
    ],
  };
}
