import type { ICruiseResult, IFlattenedRuleSet } from 'dependency-cruiser';

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

export type VisualizationConfig = {
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

export type DependencyCruiserConfig = IFlattenedRuleSet;

export type DepcruiseVizResult = {
  config: DependencyCruiserConfig;
  visualization: VisualizationConfig;
  cruiseResult: ICruiseResult | string;
};
