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

export const ImportSchema = Schema.Tuple([Schema.String, Schema.String]);

export type Import = typeof ImportSchema.Type;

export const ViolationSchema = Schema.Struct({
  from: Schema.String,
  line: Schema.Number,
  column: Schema.Number,
  to: Schema.optional(Schema.String),
  reason: Schema.Literals([
    'inside',
    'door',
    'contract',
    'restriction',
    'unused-exception',
    'stale-restriction',
  ]),
  message: Schema.String,
}).annotate({
  title: 'Violation',
  description:
    "One thing that breaks its Package's monoverse.json rules, at a file relative to the root, as @kestack/monoverse judges it for `monoverse lint`: an import statement, a contract, or an exception or restriction of the monoverse.json itself.",
});

export type Violation = typeof ViolationSchema.Type;

export const ExceptedSchema = Schema.Struct({
  from: Schema.String,
  line: Schema.Number,
  column: Schema.Number,
  to: Schema.String,
  by: Schema.Literals(['door', 'exception']),
  message: Schema.String,
}).annotate({
  title: 'Excepted import',
  description:
    "One import its Package's monoverse.json allows although it is beside or above the importing file, at files relative to the root, as @kestack/monoverse judges it: let through by a door, or by one of its exceptions, with a sentence saying which.",
});

export type Excepted = typeof ExceptedSchema.Type;

export const CheckSchema = Schema.TaggedUnion({
  Unchecked: {},
  Invalid: { file: Schema.String, message: Schema.String },
  Checked: {
    violations: Schema.Array(ViolationSchema),
    excepted: Schema.Array(ExceptedSchema),
    doors: Schema.Array(Schema.String),
  },
}).annotate({
  title: 'Check',
  description:
    "What a Package's monoverse.json makes of its imports at a branch: none, a file that cannot be read, or its Violations, the imports a door or an exception lets through, and its door folders, relative to the root.",
});

export type Check = typeof CheckSchema.Type;

export const PackageSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  version: Schema.optional(Schema.String),
  private: Schema.Boolean,
  dependencies: Schema.Array(PackageDependencySchema),
  check: CheckSchema,
}).annotate({
  title: 'Package',
  description:
    'A folder matched by the workspace globs that holds a package.json, or the root of a Single Package, with its Check. `path` is relative to the root (`.` for a Single Package).',
});

export type Package = typeof PackageSchema.Type;

export const PackageCycleSchema = Schema.Struct({
  packages: Schema.Array(Schema.String),
}).annotate({
  title: 'Package Cycle',
  description:
    'Two or more Packages that depend on each other in a loop, across any Dependency kinds, by name. Listed in dependency order, starting at the alphabetically first member.',
});

export type PackageCycle = typeof PackageCycleSchema.Type;

export const PackageManagerSchema = Schema.Literals([
  'pnpm',
  'npm',
  'yarn',
  'bun',
]).annotate({
  title: 'Package Manager',
  description: 'The tool a Monorepo is managed with.',
});

export type PackageManager = typeof PackageManagerSchema.Type;

export const WorkspaceSchema = Schema.Struct({
  kind: Schema.Literals(['monorepo', 'single-package']),
  name: Schema.String,
  path: Schema.String,
  packageManager: PackageManagerSchema,
  packages: Schema.Array(PackageSchema),
  cycles: Schema.Array(PackageCycleSchema),
  files: Schema.Array(Schema.String),
}).annotate({
  title: 'Workspace',
  description:
    'One Monorepo or Single Package as Monoverse opens it: which of the two it is, its Package Manager, its Packages and their dependencies on each other, the Package cycles among them, and every file in it.',
});

export type Workspace = typeof WorkspaceSchema.Type;

export const PackageContentsSchema = Schema.Struct({
  path: Schema.String,
  files: Schema.Array(Schema.String),
  sourceRoots: Schema.Array(Schema.String),
  imports: Schema.Array(ImportSchema),
  check: CheckSchema,
}).annotate({
  title: 'Package Contents',
  description:
    "One Package's files, its Source roots, its file import graph (every import from a source file to another source file of the same Package, resolved as its Check resolves it), and its Check.",
});

export type PackageContents = typeof PackageContentsSchema.Type;
