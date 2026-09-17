export type DependencyKind = 'runtime' | 'dev' | 'peer' | 'optional';

export type PackageDependency = {
  readonly name: string;
  readonly kinds: readonly DependencyKind[];
};

export type Package = {
  readonly name: string;
  readonly path: string;
  readonly group: string;
  readonly version?: string;
  readonly private: boolean;
  readonly hasLaymos: boolean;
  readonly dependencies: readonly PackageDependency[];
};

export type PackageCycleViolation = {
  readonly packages: readonly string[];
};

export type MonorepoAnalysis = {
  readonly name: string;
  readonly path: string;
  readonly packages: readonly Package[];
  readonly violations: readonly PackageCycleViolation[];
};
