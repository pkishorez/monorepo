export type ModuleKind = 'regular' | 'root' | 'terminal' | 'isolated';

export interface NestedModule {
  readonly id: string;
  readonly path: string;
}

export interface Module {
  readonly id: string;
  readonly layerId: string;
  readonly shared: boolean;
  readonly kind: ModuleKind;
  readonly unexposed?: boolean;
  readonly nested: readonly NestedModule[];
}

export interface ModuleDependency {
  readonly fromModuleId: string;
  readonly toModuleId: string;
  readonly toEntryPointId: string;
}

interface ModuleImportViolation {
  readonly id: string;
  readonly fromModuleId: string;
  readonly toModuleId: string;
  readonly fromFile: string;
  readonly toFile: string;
}

export type ModuleViolation =
  | ({ readonly kind: 'dependency' } & ModuleImportViolation)
  | ({ readonly kind: 'boundary' } & ModuleImportViolation)
  | {
      readonly id: string;
      readonly kind: 'cycle';
      readonly moduleIds: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: 'missing-entry-point';
      readonly moduleId: string;
      readonly entryPointId: string;
      readonly path: string;
    }
  | {
      readonly id: string;
      readonly kind: 'coverage';
      readonly layerId: string;
      readonly file: string;
    };
