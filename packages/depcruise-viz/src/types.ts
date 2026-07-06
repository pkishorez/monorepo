import type { ICruiseResult, IFlattenedRuleSet } from 'dependency-cruiser';

export type LayerConfig = {
  description?: string;
};

export type Layer = {
  readonly name: string;
  readonly paths: readonly string[];
  readonly config: LayerConfig;
};

export type LayerGraphConfig = {
  description?: string;
};

/** A directed allowed-dependency edge between two layers. */
export type LayerEdge = {
  readonly from: Layer;
  readonly to: Layer;
};

/** A DAG of layers. An import from layer A to layer B is allowed iff a
 * directed path A -> ... -> B exists; every other ordered pair is forbidden,
 * so layers with no path between them are mutually independent siblings. */
export type LayerGraph = {
  readonly kind: 'layer-graph';
  readonly name: string;
  readonly layers: readonly Layer[];
  readonly edges: readonly LayerEdge[];
  readonly config: LayerGraphConfig;
};

/** Enforced constraints on a module's edges in the declared-module graph.
 * `root` (no module may import this) is sugar for `onlyImportedBy: []`;
 * `leaf` (this module may import no module) is sugar for `onlyImports: []`.
 * Set entries reference other declared modules by path. Imports of files
 * outside every declared module (and node_modules) are out of scope. */
export type ModuleRules = {
  readonly root?: true;
  readonly leaf?: true;
  readonly onlyImports?: readonly string[];
  readonly onlyImportedBy?: readonly string[];
};

export type ModuleRuleName = keyof ModuleRules;

/** A declared module: a single folder or file in exactly one layer. `name`
 * overrides the path-derived display name. `opaque` marks the module as a
 * barrel: its files still count for coverage and layer checks, but its
 * outgoing module edges are not analyzed. `rules` are enforced constraints
 * checked against the module graph. */
export type ModuleDecl = {
  readonly path: string;
  readonly name?: string;
  readonly opaque: boolean;
  readonly rules?: ModuleRules;
};

export type Rule = LayerGraph;

export type ProjectConfig = {
  rootDir: string;
  ignore?: string[];
  rules?: Rule[];
  modules?: ModuleDecl[];
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
    /** Transitive reduction of the authored DAG — the minimal edge set. */
    edges: Array<{ from: string; to: string }>;
    allowedImports: Array<{ from: string; to: string }>;
  }>;
  modules?: Array<{
    path: string;
    name: string;
    layer: string;
    opaque: boolean;
    rules?: ModuleRules;
  }>;
};

/** A layer-ordering violation: `fromFile` (in layer `from`) imports `toFile`
 * (in layer `to`) with no allowing path in the layer graph. */
export type LayerViolation = {
  from: string;
  to: string;
  fromFile: string;
  toFile: string;
  rule: string;
  severity: string;
};

/** A module-rule violation: `fromFile` (in module `from`) imports `toFile`
 * (in module `to`) against the rule declared on `module`. One violation per
 * offending file-level edge. */
export type ModuleViolation = {
  module: string;
  rule: ModuleRuleName;
  from: string;
  to: string;
  fromFile: string;
  toFile: string;
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
  /** Declared modules whose paths nest inside one another. Modules must be
   * exhaustive and mutually exclusive, so a hierarchical declaration (e.g.
   * `dev` and `dev/components`) is a violation: files under the inner module
   * would be silently split away from the outer one. */
  moduleOverlaps: ModuleOverlap[];
  moduleEdges: ModuleEdge[];
  /** Cross-module imports that break a declared module rule. */
  moduleViolations: ModuleViolation[];
};

/** Two declared modules where `outer`'s path contains `inner`'s, making their
 * file sets overlap. */
export type ModuleOverlap = {
  outerPath: string;
  outerLayer: string;
  outerName: string;
  innerPath: string;
  innerLayer: string;
  innerName: string;
};

export type DependencyCruiserConfig = IFlattenedRuleSet;

export type DepcruiseVizData = {
  config: VisualizationConfig;
  summary: VizSummary;
};

export type DepcruiseVizResult = {
  dependencyCruiserConfig: DependencyCruiserConfig;
  cruiseResult: ICruiseResult;
  config: VisualizationConfig;
  summary: VizSummary;
};
