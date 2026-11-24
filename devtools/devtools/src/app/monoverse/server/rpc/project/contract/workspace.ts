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
  version: Schema.optional(Schema.String),
  private: Schema.Boolean,
  dependencies: Schema.Array(PackageDependencySchema),
}).annotate({
  title: 'Package',
  description:
    'A folder matched by the workspace globs that holds a package.json, or the root of a Single Package. `path` is relative to the root (`.` for a Single Package).',
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
  /** The absolute folder opened. */
  path: Schema.String,
  packageManager: PackageManagerSchema,
  packages: Schema.Array(PackageSchema),
  cycles: Schema.Array(PackageCycleSchema),
  /**
   * Every file git knows (tracked, or new and not ignored), relative to
   * the root: the repo view draws those outside every Package, and lists
   * them all when a folder is viewed.
   */
  files: Schema.Array(Schema.String),
}).annotate({
  title: 'Workspace',
  description:
    'One Monorepo or Single Package as Monoverse opens it: which of the two it is, its Package Manager, its Packages and their dependencies on each other, the Package cycles among them, and every file in it.',
});

export type Workspace = typeof WorkspaceSchema.Type;

/** An import of one file by another, both relative to the root: `[from, to]`. */
export const ImportSchema = Schema.Tuple([Schema.String, Schema.String]);

export type Import = typeof ImportSchema.Type;

export const PackageContentsSchema = Schema.Struct({
  /** The Package's folder, relative to the root. */
  path: Schema.String,
  /** Every file git knows inside the Package, relative to the root. */
  files: Schema.Array(Schema.String),
  /**
   * The Package's Source roots, relative to the root: its
   * `laymos.config.json` `sourceRoots`, or the whole Package without one.
   */
  sourceRoots: Schema.Array(Schema.String),
  /** Which source file imports which, inside the Source roots. */
  imports: Schema.Array(ImportSchema),
}).annotate({
  title: 'Package Contents',
  description:
    "One Package's files, its Source roots, and its file import graph: every import from a source file to another source file of the same Package, as OXC resolves it.",
});

export type PackageContents = typeof PackageContentsSchema.Type;
