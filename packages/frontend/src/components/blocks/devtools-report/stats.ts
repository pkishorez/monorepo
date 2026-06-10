import type { DepcruiseVizData } from '../dependency-cruiser-viz/model';
import type { TestStatus, VtestConfig } from '../vtest';

/** Roll-up of a vtest payload's test outcomes, for tab badges and banners. */
export interface VtestStats {
  readonly features: number;
  readonly total: number;
  readonly pass: number;
  readonly fail: number;
  readonly skip: number;
  readonly pending: number;
  readonly running: number;
  readonly diagnostics: number;
  /** At least one test carries a non-`pending` status (a run happened). */
  readonly ran: boolean;
  /** A run happened, every test passed, and nothing failed or is pending. */
  readonly allPassed: boolean;
}

/** Tally a {@link VtestConfig}'s tests by status across every feature/group. */
export function vtestStats(config: VtestConfig): VtestStats {
  const counts: Record<TestStatus, number> = {
    pass: 0,
    fail: 0,
    skip: 0,
    pending: 0,
    running: 0,
  };
  let diagnostics = 0;

  for (const feature of config.features) {
    diagnostics += feature.diagnostics.length;
    for (const group of feature.groups) {
      for (const test of group.tests) counts[test.status] += 1;
    }
  }

  const total =
    counts.pass + counts.fail + counts.skip + counts.pending + counts.running;
  const ran = total - counts.pending > 0;

  return {
    features: config.features.length,
    total,
    pass: counts.pass,
    fail: counts.fail,
    skip: counts.skip,
    pending: counts.pending,
    running: counts.running,
    diagnostics,
    ran,
    allPassed:
      ran &&
      total > 0 &&
      counts.fail === 0 &&
      counts.pending === 0 &&
      counts.running === 0 &&
      counts.pass > 0,
  };
}

/** Roll-up of a dependency-cruiser payload's health, for tab badges/banners. */
export interface DepcruiseStats {
  readonly layers: number;
  readonly modules: number;
  readonly violations: number;
  readonly breaches: number;
  readonly coverageGaps: number;
  /** No layer violations and no feature breaches. */
  readonly clean: boolean;
}

/** Summarise a {@link DepcruiseVizData} payload's architecture health. */
export function depcruiseStats(data: DepcruiseVizData): DepcruiseStats {
  const summary = data.summary;
  const violations = summary?.violations.length ?? 0;
  const breaches = summary?.breaches.length ?? 0;

  return {
    layers: summary?.coveredFiles.length ?? 0,
    modules: summary?.moduleCoverage.length ?? 0,
    violations,
    breaches,
    coverageGaps: summary?.coverageGaps.length ?? 0,
    clean: violations === 0 && breaches === 0,
  };
}
