import type { VisualizationConfig, Visibility, VizSummary } from './types';

/**
 * Single source of truth for visibility-tier colors, shared by the Features
 * canvas (module nodes + legend) and the file tree. Public = emerald (green),
 * shared = amber (yellow), private = violet (distinct from the sky layer color
 * and vivid enough to stand out on a dark file tree).
 */
export const VISIBILITY_COLOR: Record<Visibility, string> = {
  public: 'hsl(160 60% 45%)',
  shared: 'hsl(38 92% 50%)',
  private: 'hsl(258 90% 66%)',
};

/**
 * Map each declared module's FULL path (`config.modules[].path`) to its
 * visibility tier. Module folder tree nodes use the full path as their `id`, so
 * the file tree can color module folders by tier (independent of selection).
 */
export function moduleVisibilityByPath(
  config: VisualizationConfig,
): Map<string, Visibility> {
  const byPath = new Map<string, Visibility>();
  for (const m of config.modules ?? []) byPath.set(m.path, m.visibility);
  return byPath;
}

/**
 * Map each covered file to the visibility tier of the module it belongs to,
 * from `summary.moduleCoverage`. Used by the file tree to color feature-context
 * rows by tier (green=public, yellow=shared, gray=private). When two modules
 * claim the same file the first wins (coverage is module-partitioned).
 */
export function fileVisibility(
  summary: VizSummary | undefined,
): Map<string, Visibility> {
  const byFile = new Map<string, Visibility>();
  for (const m of summary?.moduleCoverage ?? []) {
    for (const f of m.files) {
      if (!byFile.has(f)) byFile.set(f, m.visibility);
    }
  }
  return byFile;
}
