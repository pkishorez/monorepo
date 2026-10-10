import type {
  ArchitectureAnalysis,
  ChangeSet,
  ModuleImport,
  TreeNode,
} from 'laymos';

/**
 * A hand-made Project of twenty Modules: nested Wrappers, two one-child
 * Wrapper chains (`src/db` → `std-table`, `tools` → `lint`), a Shared Rule,
 * two Exceptions, two Violations, a loose file in a plain Wrapper and an
 * unused Rule.
 */

interface Spec {
  readonly path: string;
  readonly kind: 'module' | 'wrapper' | 'file';
  /** Own files beyond the Index, named relative to the folder. */
  readonly files?: readonly string[];
}

const specs: readonly Spec[] = [
  { path: '.', kind: 'wrapper' },
  { path: 'apps', kind: 'wrapper' },
  { path: 'apps/web', kind: 'module', files: ['main.tsx', 'routes.tsx'] },
  { path: 'apps/cli', kind: 'module', files: ['main.ts'] },
  { path: 'scripts', kind: 'wrapper', files: ['seed.ts'] },
  { path: 'tools', kind: 'wrapper' },
  { path: 'tools/lint', kind: 'module', files: ['rules.ts'] },
  { path: 'src', kind: 'module', files: ['compose.ts'] },
  { path: 'src/app', kind: 'module', files: ['app.ts', 'routes.ts'] },
  { path: 'src/sync', kind: 'module', files: ['sync.ts', 'conflicts.ts'] },
  { path: 'src/studio-rpc', kind: 'module', files: ['rpc.ts'] },
  { path: 'src/db', kind: 'wrapper' },
  { path: 'src/db/std-table', kind: 'wrapper' },
  { path: 'src/db/std-table/definition', kind: 'module', files: ['table.ts'] },
  { path: 'src/db/std-table/query', kind: 'module', files: ['select.ts'] },
  { path: 'src/db/std-table/migrate', kind: 'module', files: ['steps.ts'] },
  { path: 'src/core', kind: 'wrapper' },
  { path: 'src/core/ids.ts', kind: 'file' },
  { path: 'src/core/clock.ts', kind: 'file' },
  { path: 'src/core/errors', kind: 'module', files: ['errors.ts'] },
  { path: 'src/domain', kind: 'wrapper' },
  {
    path: 'src/domain/orders',
    kind: 'module',
    files: ['order.ts', 'internal.ts'],
  },
  { path: 'src/domain/orders/pricing', kind: 'module', files: ['price.ts'] },
  { path: 'src/domain/customers', kind: 'module', files: ['customer.ts'] },
  { path: 'src/domain/catalog', kind: 'module', files: ['catalog.ts'] },
  { path: 'src/infra', kind: 'module', files: ['boot.ts'] },
  { path: 'src/infra/http', kind: 'module', files: ['server.ts'] },
  { path: 'src/infra/queue', kind: 'module', files: ['queue.ts'] },
];

const parentOf = (path: string) =>
  path === '.'
    ? undefined
    : path.includes('/')
      ? path.slice(0, path.lastIndexOf('/'))
      : '.';

const nodes: readonly TreeNode[] = specs.map((spec) => {
  const index =
    spec.kind === 'file'
      ? spec.path
      : spec.kind === 'module'
        ? `${spec.path}/index.ts`
        : undefined;
  return {
    path: spec.path,
    kind: spec.kind === 'wrapper' ? 'wrapper' : 'module',
    shape: spec.kind === 'file' ? 'file' : 'folder',
    index,
    ownFiles: [
      ...(index === undefined ? [] : [index]),
      ...(spec.files ?? []).map((file) => `${spec.path}/${file}`),
    ],
    parent: parentOf(spec.path),
    children: specs
      .filter((child) => parentOf(child.path) === spec.path)
      .map((child) => child.path)
      .sort(),
  };
});

const owners = Object.fromEntries(
  nodes.flatMap((node) => node.ownFiles.map((file) => [file, node.path])),
);

const indexOf = (module: string) =>
  nodes.find((node) => node.path === module)!.index!;

const ruled = (
  fromModule: string,
  toModule: string,
  rule: { from: string; to: string },
  fromFile = indexOf(fromModule),
): ModuleImport => ({
  fromFile,
  fromModule,
  toFile: indexOf(toModule),
  toModule,
  verdict: { kind: 'rule', rule },
});

const nested = (fromModule: string, toModule: string): ModuleImport => ({
  fromFile: indexOf(fromModule),
  fromModule,
  toFile: indexOf(toModule),
  toModule,
  verdict: { kind: 'nested' },
});

const httpException = {
  from: 'src/infra/http',
  to: 'src',
  because:
    'http boots the app through its Index until the composition root moves out',
};

const customersException = {
  from: 'src/domain/customers',
  to: 'src/domain/orders',
  because:
    'customers read order history; untangling it waits for the ledger split',
};

const sharedErrorsRule = { from: '*', to: 'src/core/errors' };

export const studioAnalysis: ArchitectureAnalysis = {
  config: {
    sourceRoots: ['apps', 'scripts', 'src', 'tools'],
    ignoredPaths: ['src/domain/orders/generated.ts'],
    fileModules: ['src/core/ids.ts', 'src/core/clock.ts'],
    rules: {
      apps: ['src'],
      'src/app': ['src/domain', 'src/sync'],
      'src/sync': ['src/db'],
      'src/studio-rpc': ['src/db/std-table/definition'],
      'src/domain': ['src/core'],
      'src/infra': ['src/db'],
      'src/db/std-table/query': ['src/db/std-table/definition'],
      'src/db/std-table/migrate': ['src/db/std-table/definition'],
      'src/domain/orders': ['src/domain/customers'],
      '*': ['src/core/errors'],
    },
    exceptions: [httpException, customersException],
  },
  tree: { root: '.', nodes, owners },
  imports: [
    ruled('apps/web', 'src', { from: 'apps', to: 'src' }),
    ruled('apps/cli', 'src', { from: 'apps', to: 'src' }),
    nested('src', 'src/app'),
    nested('src', 'src/infra'),
    nested('src/infra', 'src/infra/http'),
    nested('src/infra', 'src/infra/queue'),
    nested('src/domain/orders', 'src/domain/orders/pricing'),
    ruled('src/app', 'src/domain/orders', {
      from: 'src/app',
      to: 'src/domain',
    }),
    ruled('src/app', 'src/domain/catalog', {
      from: 'src/app',
      to: 'src/domain',
    }),
    ruled('src/app', 'src/sync', { from: 'src/app', to: 'src/sync' }),
    ruled('src/sync', 'src/db/std-table/query', {
      from: 'src/sync',
      to: 'src/db',
    }),
    ruled('src/sync', 'src/db/std-table/definition', {
      from: 'src/sync',
      to: 'src/db',
    }),
    ruled('src/studio-rpc', 'src/db/std-table/definition', {
      from: 'src/studio-rpc',
      to: 'src/db/std-table/definition',
    }),
    ruled('src/domain/orders', 'src/core/ids.ts', {
      from: 'src/domain',
      to: 'src/core',
    }),
    ruled('src/domain/customers', 'src/core/ids.ts', {
      from: 'src/domain',
      to: 'src/core',
    }),
    ruled('src/domain/orders', 'src/core/clock.ts', {
      from: 'src/domain',
      to: 'src/core',
    }),
    ruled('src/infra/queue', 'src/db/std-table/query', {
      from: 'src/infra',
      to: 'src/db',
    }),
    ruled('src/db/std-table/query', 'src/db/std-table/definition', {
      from: 'src/db/std-table/query',
      to: 'src/db/std-table/definition',
    }),
    ruled('src/domain/orders', 'src/domain/customers', {
      from: 'src/domain/orders',
      to: 'src/domain/customers',
    }),
    ruled('src/app', 'src/core/errors', sharedErrorsRule),
    ruled('src/sync', 'src/core/errors', sharedErrorsRule),
    ruled('src/infra/http', 'src/core/errors', sharedErrorsRule),
    {
      fromFile: 'src/infra/http/server.ts',
      fromModule: 'src/infra/http',
      toFile: 'src/index.ts',
      toModule: 'src',
      verdict: { kind: 'exception', exception: httpException },
    },
    {
      fromFile: 'src/domain/customers/customer.ts',
      fromModule: 'src/domain/customers',
      toFile: 'src/domain/orders/index.ts',
      toModule: 'src/domain/orders',
      verdict: { kind: 'exception', exception: customersException },
    },
    {
      fromFile: 'src/domain/catalog/catalog.ts',
      fromModule: 'src/domain/catalog',
      toFile: 'src/infra/http/index.ts',
      toModule: 'src/infra/http',
      verdict: { kind: 'violation', reason: 'no-rule', remedy: 'rule' },
    },
    {
      fromFile: 'src/app/routes.ts',
      fromModule: 'src/app',
      toFile: 'src/domain/orders/internal.ts',
      toModule: 'src/domain/orders',
      verdict: { kind: 'violation', reason: 'not-index', remedy: 'none' },
    },
  ],
  findings: [
    { kind: 'wrapper-coverage', file: 'scripts/seed.ts' },
    {
      kind: 'unused-rule',
      rule: {
        from: 'src/db/std-table/migrate',
        to: 'src/db/std-table/definition',
      },
    },
  ],
};

/** A Change set touching three Modules of the studio: one new, two modified. */
export const studioChanges: ChangeSet = {
  baseRef: 'main',
  files: [
    {
      path: 'src/sync/index.ts',
      status: 'added',
      committed: true,
      uncommitted: false,
    },
    {
      path: 'src/sync/sync.ts',
      status: 'added',
      committed: true,
      uncommitted: false,
    },
    {
      path: 'src/sync/conflicts.ts',
      status: 'added',
      committed: false,
      uncommitted: true,
    },
    {
      path: 'src/app/routes.ts',
      status: 'modified',
      committed: false,
      uncommitted: true,
    },
    {
      path: 'src/db/std-table/query/select.ts',
      status: 'modified',
      committed: true,
      uncommitted: false,
    },
    {
      path: 'README.md',
      status: 'modified',
      committed: true,
      uncommitted: false,
    },
    {
      path: 'src/infra/legacy-mail/index.ts',
      status: 'deleted',
      committed: false,
      uncommitted: true,
    },
    {
      path: 'src/infra/legacy-mail/smtp.ts',
      status: 'deleted',
      committed: false,
      uncommitted: true,
    },
  ],
};
