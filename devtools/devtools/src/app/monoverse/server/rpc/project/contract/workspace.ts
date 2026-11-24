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

/** An import of one file by another, both relative to the root: `[from, to]`. */
export const ImportSchema = Schema.Tuple([Schema.String, Schema.String]);

export type Import = typeof ImportSchema.Type;

export const ViolationSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  /** `inside`: it reaches inside a module; `door`: it reaches beside or above, not through a door. */
  reason: Schema.Literals(['inside', 'door']),
  /** What `vp lint` says of it, word for word but naming the file by its path. */
  message: Schema.String,
}).annotate({
  title: 'Violation',
  description:
    "One import that breaks its Package's monoverse.json rules, both files relative to the root, as @kestack/monoverse judges it.",
});

export type Violation = typeof ViolationSchema.Type;

export const CheckSchema = Schema.TaggedUnion({
  /** No monoverse.json: the Package is not checked. */
  Unchecked: {},
  /** A monoverse.json that cannot be read, and why. */
  Invalid: { message: Schema.String },
  /** Checked: every import that breaks the rules. */
  Checked: { violations: Schema.Array(ViolationSchema) },
}).annotate({
  title: 'Check',
  description:
    "What a Package's monoverse.json makes of its imports at a branch: none, a file that cannot be read, or its Violations.",
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

export const PackageContentsSchema = Schema.Struct({
  /** The Package's folder, relative to the root. */
  path: Schema.String,
  /** Every file git knows inside the Package, relative to the root. */
  files: Schema.Array(Schema.String),
  /**
   * The Package's Source roots, relative to the root: the `sourceRoots`
   * of its monoverse.json, the only files its rules check; the whole
   * Package without a monoverse.json that can be read.
   */
  sourceRoots: Schema.Array(Schema.String),
  /** Which source file imports which, every source file git knows in it, tests too. */
  imports: Schema.Array(ImportSchema),
  check: CheckSchema,
}).annotate({
  title: 'Package Contents',
  description:
    "One Package's files, its Source roots, its file import graph (every import from a source file to another source file of the same Package, as OXC resolves it), and its Check.",
});

export type PackageContents = typeof PackageContentsSchema.Type;
