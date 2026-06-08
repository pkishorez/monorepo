import { moduleFiles, moduleKey } from './modules';
import type { VizSummary } from './types';

export type FeatureFocus = {
  /** `layer::name` keys of modules owned by the selected feature. */
  owned: Set<string>;
  /** `layer::name` keys of shared/public modules the feature legally consumes. */
  consumed: Set<string>;
};

/**
 * For a selected feature F, the modules to light up on the canvas / tree:
 * - owned: `moduleCoverage` where `feature === F`
 * - consumed: shared/public modules F actually imports, taken straight from
 *   `featureModuleEdges` with `relation === 'consumes'`. This is the real
 *   import graph, so a public (ownerless) module only lights up for the
 *   features that genuinely depend on it — never for every feature.
 */
export function featureFocus(
  summary: VizSummary | undefined,
  feature: string,
): FeatureFocus {
  const owned = new Set<string>();
  const consumed = new Set<string>();
  if (!summary) return { owned, consumed };

  for (const m of summary.moduleCoverage) {
    if (m.feature === feature) owned.add(moduleKey(m.layer, m.module));
  }

  for (const e of summary.featureModuleEdges) {
    if (e.feature === feature && e.relation === 'consumes') {
      consumed.add(moduleKey(e.layer, e.module));
    }
  }

  return { owned, consumed };
}

/**
 * Files reached by a feature: the union of files of its owned modules and the
 * shared modules it consumes. Returns null when the feature owns/consumes
 * nothing (so callers can treat it as "no highlight").
 */
export function featureFiles(
  summary: VizSummary | undefined,
  feature: string,
): Set<string> | null {
  if (!summary) return null;
  const focus = featureFocus(summary, feature);
  const keys = new Set([...focus.owned, ...focus.consumed]);
  if (keys.size === 0) return null;
  const byKey = moduleFiles(summary);
  const files = new Set<string>();
  for (const key of keys) {
    for (const f of byKey.get(key) ?? []) files.add(f);
  }
  return files.size > 0 ? files : null;
}

/**
 * Like {@link featureFiles} but split into the two tiers a feature reaches:
 * - `owned`: files of the modules the feature owns (its own vertical slice).
 * - `consumed`: files of the shared/public modules it legally borrows.
 *
 * A file owned by the feature takes precedence: if the same file surfaces in
 * both sets (a module appears as owned and consumed) it is kept in `owned` and
 * dropped from `consumed`. Returns null when the feature reaches no files, so
 * callers can treat it as "no highlight" exactly like {@link featureFiles}.
 */
export function featureFileSets(
  summary: VizSummary | undefined,
  feature: string,
): { owned: Set<string>; consumed: Set<string> } | null {
  if (!summary) return null;
  const focus = featureFocus(summary, feature);
  if (focus.owned.size === 0 && focus.consumed.size === 0) return null;
  const byKey = moduleFiles(summary);
  const owned = new Set<string>();
  for (const key of focus.owned) {
    for (const f of byKey.get(key) ?? []) owned.add(f);
  }
  const consumed = new Set<string>();
  for (const key of focus.consumed) {
    for (const f of byKey.get(key) ?? []) {
      if (!owned.has(f)) consumed.add(f);
    }
  }
  if (owned.size === 0 && consumed.size === 0) return null;
  return { owned, consumed };
}
