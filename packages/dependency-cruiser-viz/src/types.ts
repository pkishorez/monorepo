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
    feature?: string;
    visibility: Visibility;
    sharedWith?: string[];
  }>;
};

export type VizSummary = {
  violations: Array<{
    from: string;
    to: string;
    fromFile: string;
    toFile: string;
    rule: string;
    severity: string;
  }>;
  layerOrphanFiles: string[];
  ignoredFiles: string[];
  coveredFiles: Array<{
    layer: string;
    files: string[];
  }>;
  moduleCoverage: Array<{
    module: string;
    layer: string;
    feature?: string;
    visibility: Visibility;
    sharedWith?: string[];
    files: string[];
  }>;
  coverageGaps: string[];
  breaches: Array<{
    fromModule: string;
    fromFeature: string | null;
    toModule: string;
    toFeature: string | null;
    toVisibility: Visibility;
    fromFile: string;
    toFile: string;
    reason: 'private-cross-feature' | 'not-in-shared-with' | 'infra-to-owned';
  }>;
  featureEdges: Array<{ from: string; to: string; via: string[] }>;
  featureModuleEdges: Array<{
    feature: string;
    module: string;
    layer: string;
    visibility: 'shared' | 'public';
    relation: 'owns' | 'consumes';
  }>;
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
