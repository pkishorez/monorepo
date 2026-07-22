export interface Layer {
  readonly kind: 'layer';
  readonly name: string;
  readonly paths: readonly string[];
  readonly description?: string;
}

export interface LayerEdge {
  readonly from: Layer;
  readonly to: Layer;
}

export interface LayerGraph {
  readonly kind: 'layer-graph';
  readonly name: string;
  readonly layers: readonly Layer[];
  readonly edges: readonly LayerEdge[];
  readonly description?: string;
}

export interface ModuleDef {
  readonly kind: 'module';
  readonly path: string;
  readonly description?: string;
}

export interface ModuleRules {
  readonly kind: 'module-rules';
  readonly module: ModuleDef;
  readonly canImport?: readonly ModuleDef[];
  readonly canImportedBy?: readonly ModuleDef[];
}

export interface LaymosConfig {
  readonly sourceRoots: readonly string[];
  readonly graphs: readonly LayerGraph[];
  readonly modules?: readonly ModuleDef[];
  readonly moduleRules?: readonly ModuleRules[];
  readonly ignore?: readonly string[];
}
