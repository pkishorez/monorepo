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

export type FeatureConfig = {
  description?: string;
  stopTraversalAt?: string[];
  group?: string;
};

export type Feature = {
  readonly kind: 'feature';
  readonly name: string;
  readonly paths: readonly string[];
  readonly config: FeatureConfig;
};

export type Rule = LayerStack;

export type ProjectConfig = {
  rootDir: string;
  ignore?: string[];
  rules: Rule[];
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
    paths: string[];
    description?: string;
    stopTraversalAt?: string[];
    group?: string;
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
  featureGraphs?: Array<{
    feature: string;
    seeds: string[];
    nodes: Array<{
      file: string;
      kind: 'seed' | 'derived';
      layers: string[];
      minDepth: number;
      maxDepth: number;
    }>;
    edges: Array<{
      from: string;
      to: string;
      dependencyKind: 'runtime' | 'type-only';
    }>;
  }>;
  featureOrphanFiles?: string[];
  featureGraphViolations?: FeatureGraphViolation[];
};

export type FeatureGraphViolation =
  | {
      kind: 'feature-cycle';
      feature: string;
      fromFile: string;
      toFile: string;
      cycle: string[];
      severity: 'error';
    }
  | {
      kind: 'feature-unresolved-import';
      feature: string;
      fromFile: string;
      specifier: string;
      severity: 'error';
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
