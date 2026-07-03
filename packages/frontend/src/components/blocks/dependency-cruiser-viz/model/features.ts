import { moduleFiles } from './modules';
import type { VizSummary } from './types';

export type FeatureFocus = {
  /** `layer::name` keys of modules declared as members of the selected feature. */
  members: Set<string>;
};

/**
 * For a selected feature, the set of module keys declared as its members.
 * Sourced from `summary.featureGraphs` (which contains the backend-derived node
 * list for each feature) so the frontend never re-infers membership.
 */
export function featureFocus(
  summary: VizSummary | undefined,
  feature: string,
): FeatureFocus {
  const members = new Set<string>();
  if (!summary) return { members };
  const fg = summary.featureGraphs.find((g) => g.feature === feature);
  if (fg) for (const n of fg.nodes) members.add(n);
  return { members };
}

/**
 * Files reached by a feature: all files of its declared member modules.
 * Returns null when the feature has no members (so callers can treat it as "no
 * highlight").
 */
export function featureFiles(
  summary: VizSummary | undefined,
  feature: string,
): Set<string> | null {
  if (!summary) return null;
  const { members } = featureFocus(summary, feature);
  if (members.size === 0) return null;
  const byKey = moduleFiles(summary);
  const files = new Set<string>();
  for (const key of members) {
    for (const f of byKey.get(key) ?? []) files.add(f);
  }
  return files.size > 0 ? files : null;
}

/**
 * Files reached by a feature, returned as `{ members }` (a single set — no
 * owned/consumed split in the new model). Returns null when the feature has no
 * member files.
 */
export function featureFileSets(
  summary: VizSummary | undefined,
  feature: string,
): { members: Set<string> } | null {
  if (!summary) return null;
  const { members: memberKeys } = featureFocus(summary, feature);
  if (memberKeys.size === 0) return null;
  const byKey = moduleFiles(summary);
  const members = new Set<string>();
  for (const key of memberKeys) {
    for (const f of byKey.get(key) ?? []) members.add(f);
  }
  return members.size > 0 ? { members } : null;
}
