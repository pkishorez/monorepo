import type { VisualizationConfig } from './types';

/**
 * The rules configured for a single feature, in source-of-truth form: the
 * feature declaration (name, description, root) and the modules declared as
 * members, resolved from `config.modules`.
 */
export type FeatureRules = {
  feature: { name: string; description?: string };
  root: string;
  modules: Array<{
    name: string;
    layer: string;
    path: string;
    barrel: boolean;
  }>;
};

function byLayerThenName(
  a: { layer: string; name: string },
  b: { layer: string; name: string },
): number {
  return a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name);
}

/**
 * Build the {@link FeatureRules} for `feature` from the authored config.
 * Members are `config.modules` whose name appears in the feature's declared
 * `modules` list. Sorted by layer then name for stable serialization.
 */
export function featureRules(
  config: VisualizationConfig,
  feature: string,
): FeatureRules {
  const decl = config.features?.find((f) => f.name === feature);

  const memberNames = new Set(decl?.modules ?? []);
  const modules = (config.modules ?? [])
    .filter((m) => memberNames.has(m.name))
    .map((m) => ({
      name: m.name,
      layer: m.layer,
      path: m.path,
      barrel: m.barrel,
    }))
    .sort(byLayerThenName);

  return {
    feature: {
      name: feature,
      ...(decl?.description ? { description: decl.description } : {}),
    },
    root: decl?.root ?? '',
    modules,
  };
}
