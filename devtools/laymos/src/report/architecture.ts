export interface ReportLayer {
  readonly paths: readonly string[];
  readonly description?: string;
}

export interface ReportLayerEdge {
  readonly from: string;
  readonly to: string;
}

export interface ReportGraph {
  readonly name: string;
  readonly layers: readonly string[];
  readonly edges: readonly ReportLayerEdge[];
  readonly description?: string;
}

export interface ReportModule {
  readonly description?: string;
}

export interface ReportModuleRules {
  readonly module: string;
  readonly canImport?: readonly string[];
  readonly canImportedBy?: readonly string[];
}

export interface ReportArchitecture {
  readonly sourceRoots: readonly string[];
  readonly layers: Readonly<Record<string, ReportLayer>>;
  readonly graphs: readonly ReportGraph[];
  readonly modules: Readonly<Record<string, ReportModule>>;
  readonly moduleRules: readonly ReportModuleRules[];
  readonly ignoredPaths: readonly string[];
}

export type ReportFile =
  | {
      readonly kind: 'ignored';
      readonly imports: readonly string[];
    }
  | {
      readonly kind: 'uncovered';
      readonly imports: readonly string[];
    }
  | {
      readonly kind: 'covered';
      readonly layer: string;
      readonly module?: string;
      readonly imports: readonly string[];
    };

export interface LayerViolation {
  readonly kind: 'layer';
  readonly from: { readonly layer: string; readonly file: string };
  readonly to: { readonly layer: string; readonly file: string };
}

export interface ModuleViolation {
  readonly kind: 'module';
  readonly rule: 'canImport' | 'canImportedBy';
  readonly from: {
    readonly module: string;
    readonly layer: string;
    readonly file: string;
  };
  readonly to: {
    readonly module: string;
    readonly layer: string;
    readonly file: string;
  };
}

export interface StoryImportViolation {
  readonly kind: 'story-import';
  readonly from: { readonly file: string };
  readonly to: { readonly module: string; readonly file: string };
}

export type Violation = LayerViolation | ModuleViolation | StoryImportViolation;

export interface LayerCoverage {
  readonly totalFiles: number;
  readonly coveredFiles: number;
  readonly uncovered: readonly string[];
}

export interface ModuleCoverage {
  readonly layer: string;
  readonly totalFiles: number;
  readonly coveredFiles: number;
  readonly uncovered: readonly string[];
}

export interface Coverage {
  readonly layers: LayerCoverage;
  readonly modules: readonly ModuleCoverage[];
}

export type AnalysisWarning =
  | {
      readonly kind: 'missing-source-root';
      readonly path: string;
    }
  | {
      readonly kind: 'missing-layer-path';
      readonly layer: string;
      readonly path: string;
    }
  | {
      readonly kind: 'missing-module-path';
      readonly module: string;
      readonly path: string;
    };

export interface LaymosReport {
  readonly architecture: ReportArchitecture;
  readonly files: Readonly<Record<string, ReportFile>>;
  readonly violations: readonly Violation[];
  readonly coverage: Coverage;
  readonly warnings: readonly AnalysisWarning[];
}
