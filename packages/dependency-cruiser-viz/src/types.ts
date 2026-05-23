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

export type Rule = LayerStack;

export type ProjectConfig = {
  rootDir: string;
  ignore?: string[];
  rules: Rule[];
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
};

export type DependencyCruiserConfig = IFlattenedRuleSet;

export type DepcruiseVizData = {
  visualization: VisualizationConfig;
  summary: VizSummary;
};

export type DepcruiseVizResult = {
  config: DependencyCruiserConfig;
  visualization: VisualizationConfig;
  summary: VizSummary;
};
