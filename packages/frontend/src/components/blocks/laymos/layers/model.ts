export interface LayerScope {
  readonly path: string;
  readonly fileCount: number;
}

export interface Layer {
  readonly id: string;
  readonly description?: string;
  readonly scopes: readonly LayerScope[];
}

export interface LayerRule {
  readonly fromLayerId: string;
  readonly toLayerIds: readonly string[];
}

export interface LayerDependencyViolation {
  readonly fromFile: string;
  readonly toFile: string;
}

export interface LayerCoverageViolation {
  readonly file: string;
}

export interface LayerViolationPair {
  readonly id: string;
  readonly fromLayerId: string;
  readonly toLayerId: string;
  readonly violations: readonly LayerDependencyViolation[];
}

export interface LayerInteraction {
  readonly activeLayerId?: string;
  readonly hoveredLayerId?: string;
  readonly onLayerHoverChange?: (layerId: string | undefined) => void;
  readonly onLayerActivate?: (layerId: string) => void;
}
