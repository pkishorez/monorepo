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
  orphanFiles: string[];
  ignoredFiles: string[];
  coveredFiles: Array<{
    layer: string;
    files: string[];
  }>;
  featureViolations?: Array<{
    from: string;
    to: string;
    fromFile: string;
    toFile: string;
    rule: string;
    severity: string;
  }>;
  featureCoveredFiles?: Array<{
    feature: string;
    files: string[];
  }>;
  featureFileEdges?: Array<{
    from: string;
    to: string;
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
