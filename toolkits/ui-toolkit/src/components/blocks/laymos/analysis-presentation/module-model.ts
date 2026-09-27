export type ModuleShape = 'file' | 'directory';
export type ModuleKind = 'regular' | 'root' | 'terminal' | 'isolated';

export type ChangeStatus = 'added' | 'modified';

export interface Module {
  readonly id: string;
  readonly layerId: string;
  readonly changeStatus?: ChangeStatus;
  readonly shared: boolean;
  readonly exposed: boolean;
  readonly kind: ModuleKind;
  readonly shape?: ModuleShape;
  // Set when this Module is a member of a Module Graph.
  readonly graphId?: string;
  readonly member?: string;
}

export interface ModuleGraphRule {
  readonly fromModuleId: string;
  readonly toModuleId: string;
}

export interface ModuleGraph {
  readonly id: string;
  readonly layerId: string;
  readonly path: string;
  readonly description?: string;
  readonly memberIds: readonly string[];
  readonly rules: readonly ModuleGraphRule[];
}

export interface ModuleDependency {
  readonly fromModuleId: string;
  readonly toModuleId: string;
  readonly toEntryPointId: string;
  readonly permitted: boolean;
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
      readonly kind: 'unused-shared';
      readonly moduleId: string;
    }
  | {
      readonly id: string;
      readonly kind: 'dead-module';
      readonly moduleId: string;
    }
  | {
      readonly id: string;
      readonly kind: 'graph-coverage';
      readonly graphId: string;
      readonly layerId: string;
      readonly file: string;
    }
  | {
      readonly id: string;
      readonly kind: 'missing-entry-point';
      readonly moduleId: string;
      readonly path: string;
    }
  | {
      readonly id: string;
      readonly kind: 'coverage';
      readonly layerId: string;
      readonly file: string;
    };
