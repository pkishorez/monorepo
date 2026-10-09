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
  readonly hasStories: boolean;
  readonly dependencies: readonly PackageDependency[];
};

export type PackageCycleViolation = {
  readonly packages: readonly string[];
};

// The tool a Monorepo is managed with.
export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

export type MonorepoAnalysis = {
  readonly name: string;
  readonly path: string;
  readonly packageManager: PackageManager;
  readonly packages: readonly Package[];
  readonly violations: readonly PackageCycleViolation[];
};
