import type { DepcruiseVizData } from '../dependency-cruiser-viz/model';

/** Roll-up of a dependency-cruiser payload's health, for tab badges/banners. */
export interface DepcruiseStats {
  readonly layers: number;
  readonly modules: number;
  readonly violations: number;
  readonly coverageGaps: number;
}

/** Summarise a {@link DepcruiseVizData} payload's architecture health. */
export function depcruiseStats(data: DepcruiseVizData): DepcruiseStats {
  const summary = data.summary;
  const violations = summary?.violations.length ?? 0;

  return {
    layers: summary?.coveredFiles.length ?? 0,
    modules: summary?.moduleCoverage.length ?? 0,
    violations,
    coverageGaps: summary?.coverageGaps.length ?? 0,
  };
}
