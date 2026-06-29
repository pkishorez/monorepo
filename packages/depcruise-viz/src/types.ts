import type { IFlattenedRuleSet } from 'dependency-cruiser';

export type LayerConfig = {
  description?: string;
};

export type Layer = {
  readonly name: string;
  readonly paths: readonly string[];
  readonly config: LayerConfig;
};

export type LayerStackConfig = {
  description?: string;
  /**
   * The group this stack belongs to. Stacks sharing a group render inside one
   * labeled region and form an isolated unit: layer identity is namespaced per
   * group, so the same layer name in another group is a distinct layer.
   * Absent means the implicit default group (shared by all ungrouped stacks).
   */
  group?: string;
};

export type LayerStack = {
  readonly kind: 'layer-stack';
  readonly name: string;
  readonly layers: readonly Layer[];
  readonly config: LayerStackConfig;
};

export type Visibility = 'private' | 'shared' | 'public';

export type ModuleDecl = {
  readonly path: string;
  readonly feature?: string;
  readonly visibility: Visibility;
  readonly sharedWith?: readonly string[];
};

export type FeatureConfig = {
  description?: string;
};

export type Feature = {
  readonly kind: 'feature';
  readonly name: string;
  readonly config: FeatureConfig;
};

export type Rule = LayerStack;

export type ProjectConfig = {
  rootDir: string;
  ignore?: string[];
  rules: Rule[];
  modules?: ModuleDecl[];
  features?: Feature[];
};

export type VisualizationConfig = {
  rootDir: string;
  ignore?: string[];
  stacks: Array<{
    name: string;
    description?: string;
    group?: string;
    layers: Array<{
      name: string;
      paths: string[];
      description?: string;
    }>;
    allowedImports: Array<{ from: string; to: string }>;
  }>;
  features?: Array<{
    name: string;
    description?: string;
  }>;
  modules?: Array<{
    path: string;
    name: string;
    layer: string;
    group?: string;
    feature?: string;
    visibility: Visibility;
    sharedWith?: string[];
  }>;
};

/** The implicit group every ungrouped stack belongs to. */
export const DEFAULT_GROUP = '';

/** A layer-ordering violation: `fromFile` (in layer `from`) imports `toFile`
 * (in layer `to`) against the stack's top-down ordering. */
export type LayerViolation = {
  from: string;
  to: string;
  fromFile: string;
  toFile: string;
  rule: string;
  severity: string;
};

/** Files covered by a declared module, with its resolved tier/owner. */
export type ModuleCoverage = {
  module: string;
  layer: string;
  feature?: string;
  visibility: Visibility;
  sharedWith?: string[];
  files: string[];
};

export type BreachReason =
  | 'private-cross-feature'
  | 'not-in-shared-with'
  | 'infra-to-owned';

/** A feature/visibility boundary breach: an import that crosses module
 * ownership in a way the declared visibility does not permit. */
export type Breach = {
  fromModule: string;
  fromFeature: string | null;
  toModule: string;
  toFeature: string | null;
  toVisibility: Visibility;
  fromFile: string;
  toFile: string;
  reason: BreachReason;
};

export type FeatureEdge = { from: string; to: string; via: string[] };

export type FeatureModuleEdge = {
  feature: string;
  module: string;
  layer: string;
  visibility: 'shared' | 'public';
  relation: 'owns' | 'consumes';
};

/** Two distinct layers whose path patterns overlap, so a file can match both
 * and is silently attributed to the first-declared layer. */
export type LayerConflict = {
  layerA: string;
  layerB: string;
  pathA: string;
  pathB: string;
};

export type VizSummary = {
  violations: LayerViolation[];
  layerOrphanFiles: string[];
  ignoredFiles: string[];
  coveredFiles: Array<{
    layer: string;
    files: string[];
  }>;
  moduleCoverage: ModuleCoverage[];
  coverageGaps: string[];
  conflicts: LayerConflict[];
  breaches: Breach[];
  featureEdges: FeatureEdge[];
  featureModuleEdges: FeatureModuleEdge[];
};

export type DependencyCruiserConfig = IFlattenedRuleSet;

export type DepcruiseVizData = {
  config: VisualizationConfig;
  summary: VizSummary;
};

export type DepcruiseVizResult = {
  dependencyCruiserConfig: DependencyCruiserConfig;
  config: VisualizationConfig;
  summary: VizSummary;
};
