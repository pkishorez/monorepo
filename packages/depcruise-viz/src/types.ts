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
};

export type LayerStack = {
  readonly kind: 'layer-stack';
  readonly name: string;
  readonly layers: readonly Layer[];
  readonly config: LayerStackConfig;
};

/** A declared module: a folder in exactly one layer. `barrel` marks re-export
 * fan-out points that are exempt from closure/coverage enforcement. */
export type ModuleDecl = {
  readonly path: string;
  readonly barrel: boolean;
};

/** A declared feature: a rooted DAG of module references spanning layers from
 * a single root downward. Membership is declarative, not inferred. */
export type Feature = {
  readonly kind: 'feature';
  readonly name: string;
  /** Module name that is the single root (entry point) of this feature. */
  readonly root: string;
  /** All module names belonging to this feature, including `root`. */
  readonly modules: readonly string[];
  readonly config: { description?: string };
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
    root: string;
    modules: string[];
  }>;
  modules?: Array<{
    path: string;
    name: string;
    layer: string;
    barrel: boolean;
  }>;
};

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

/** Files covered by a declared module. */
export type ModuleCoverage = {
  module: string;
  layer: string;
  files: string[];
};

/** A resolved import between two distinct modules. */
export type ModuleEdge = {
  fromLayer: string;
  fromModule: string;
  toLayer: string;
  toModule: string;
  kind: 'legal' | 'breach';
};

/** Two distinct layers whose path patterns overlap, so a file can match both
 * and is silently attributed to the first-declared layer. */
export type LayerConflict = {
  layerA: string;
  layerB: string;
  pathA: string;
  pathB: string;
};

/** A feature-closure violation produced by lint/analysis. */
export type FeatureClosureViolation = {
  reason:
    | 'unclaimed-edge'
    | 'closure-escape'
    | 'multi-root'
    | 'no-root'
    | 'uncovered-file';
  feature?: string;
  fromModule?: string;
  toModule?: string;
  fromFile?: string;
  toFile?: string;
  detail: string;
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
  /** Declared modules whose path resolves to zero files — usually a redundant
   * declaration whose files are all owned by a more-specific nested module. */
  emptyModules: Array<{ path: string; layer: string; name: string }>;
  conflicts: LayerConflict[];
  moduleEdges: ModuleEdge[];
  /** Per-feature derived graph: nodes and edges restricted to that feature's
   * declared member set. Populated by analysis (Task 4). */
  featureGraphs: Array<{
    feature: string;
    root: string;
    nodes: string[];
    edges: Array<{ from: string; to: string; kind: 'legal' | 'breach' }>;
  }>;
  /** Closure violations detected across all features. Populated by analysis
   * (Task 4). */
  closureViolations: FeatureClosureViolation[];
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
