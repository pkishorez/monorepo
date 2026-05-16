export type Layer = {
  id: number;
  label: string;
  color?: string;
};

export type Module = {
  id: string;
  label: string;
  layer: number;
  description?: string;
};

export type Edge = {
  from: string;
  to: string;
  status: 'allowed' | 'violated';
};

export type LayerRule = {
  layer: number;
  canImportFromLayers: number[];
};

export type DependencyGraph = {
  layers: Layer[];
  modules: Module[];
  edges: Edge[];
  rules: LayerRule[];
};
