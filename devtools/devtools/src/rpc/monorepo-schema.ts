import { Schema } from 'effect';

export const DependencyKindSchema = Schema.Literals([
  'runtime',
  'dev',
  'peer',
  'optional',
]);

export type DependencyKind = typeof DependencyKindSchema.Type;

export const PackageDependencySchema = Schema.Struct({
  name: Schema.String,
  kinds: Schema.Array(DependencyKindSchema),
}).annotate({
  title: 'Package Dependency',
  description:
    'One Package naming another Package of the same Monorepo, matched by name alone, with every Dependency kind that declares it.',
});

export type PackageDependency = typeof PackageDependencySchema.Type;

export const PackageSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  group: Schema.String,
  version: Schema.optional(Schema.String),
  private: Schema.Boolean,
  hasLaymos: Schema.Boolean,
  dependencies: Schema.Array(PackageDependencySchema),
}).annotate({
  title: 'Package',
  description:
    'One node of a Monorepo: a folder matched by the workspace globs that holds a package.json. `path` is relative to the Monorepo root; `group` is the first path segment. `hasLaymos` is the Laymos badge.',
});

export type Package = typeof PackageSchema.Type;

export const PackageCycleViolationSchema = Schema.Struct({
  packages: Schema.Array(Schema.String),
}).annotate({
  title: 'Package Cycle Violation',
  description:
    'Two or more Packages that depend on each other in a loop, across any Dependency kinds. Listed in dependency order, starting at the alphabetically first member.',
});

export type PackageCycleViolation = typeof PackageCycleViolationSchema.Type;

export const MonorepoAnalysisSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  packages: Schema.Array(PackageSchema),
  violations: Schema.Array(PackageCycleViolationSchema),
}).annotate({
  title: 'Monorepo Analysis',
  description:
    'The complete renderer-neutral description of one Monorepo: its Packages, their dependencies on each other, and the Package cycles found among them.',
});

export type MonorepoAnalysis = typeof MonorepoAnalysisSchema.Type;
