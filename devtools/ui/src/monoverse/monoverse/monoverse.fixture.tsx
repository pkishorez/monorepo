import { useState } from 'react';
import { Effect } from 'effect';
import type { ChangeSet, FileDiff } from 'laymos';
import type { MonorepoAnalysis, Package } from '../analysis';

import {
  Monoverse,
  type PackageReadmeDocuments,
  type RenderLaymos,
} from './monoverse';

function pkg(
  name: string,
  group: string,
  dependencies: Package['dependencies'] = [],
  extra: Partial<Package> = {},
): Package {
  return {
    name,
    path: `${group}/${name}`,
    group,
    version: '0.1.0',
    private: group !== 'packages',
    hasLaymos: false,
    dependencies,
    ...extra,
  };
}

const analysis: MonorepoAnalysis = {
  name: 'public-monorepo',
  path: '/repo',
  packages: [
    pkg('docs', 'apps', [
      { name: 'kui-toolkit', kinds: ['runtime'] },
      { name: 'std-toolkit', kinds: ['runtime'] },
      { name: 'laymos', kinds: ['dev'] },
    ]),
    pkg(
      'devtools',
      'devtools',
      [
        { name: 'kui-toolkit', kinds: ['runtime'] },
        { name: 'laymos', kinds: ['runtime'] },
        { name: 'monoverse', kinds: ['runtime'] },
        { name: 'rpc-toolkit', kinds: ['runtime'] },
      ],
      { hasLaymos: true },
    ),
    pkg('laymos', 'devtools', [{ name: 'std-toolkit', kinds: ['dev'] }], {
      hasLaymos: true,
    }),
    pkg('monoverse', 'devtools', [{ name: 'laymos', kinds: ['dev'] }], {
      hasLaymos: true,
    }),
    pkg(
      'kui-toolkit',
      'toolkits',
      [
        { name: 'laymos', kinds: ['peer', 'dev'] },
        { name: 'monoverse', kinds: ['peer', 'dev'] },
        { name: 'std-toolkit', kinds: ['peer', 'dev'] },
        { name: 'use-effect-ts', kinds: ['peer', 'dev'] },
      ],
      { hasLaymos: true },
    ),
    pkg(
      'std-toolkit',
      'toolkits',
      [{ name: 'use-effect-ts', kinds: ['optional'] }],
      { hasLaymos: true },
    ),
    pkg('rpc-toolkit', 'toolkits', [
      { name: 'std-toolkit', kinds: ['runtime'] },
      { name: 'auth-toolkit', kinds: ['dev'] },
    ]),
    pkg('auth-toolkit', 'toolkits', [
      { name: 'rpc-toolkit', kinds: ['runtime'] },
    ]),
    pkg('use-effect-ts', 'packages'),
    pkg('scratch', 'packages'),
  ],
  violations: [{ packages: ['auth-toolkit', 'rpc-toolkit'] }],
};

const renderLaymos: RenderLaymos = ({ projectPath, pkg: target }) => (
  <div className="grid flex-1 place-items-center p-8 text-center">
    <div className="space-y-1">
      <p className="text-sm font-semibold">Embedded Laymos for {target.name}</p>
      <p className="font-mono text-xs text-muted-foreground">{projectPath}</p>
    </div>
  </div>
);

const readmeDocuments: PackageReadmeDocuments = {
  'README.md': {
    kind: 'ready',
    markdown: [
      '# Package README',
      '',
      'Right-click any Package to open this. Relative markdown links stack:',
      '[eschema](src/eschema/README.md), [core](src/core/README.md).',
      '',
      'Other links open elsewhere: [source](src/index.ts),',
      '[the web](https://example.com).',
    ].join('\n'),
  },
  'src/eschema/README.md': {
    kind: 'ready',
    markdown: '# eschema\n\nSibling: [core](../core/README.md).',
  },
  'src/core/README.md': { kind: 'missing' },
};

function packageFiles(pkg: Package) {
  return [
    {
      path: `${pkg.path}/package.json`,
      content: JSON.stringify({ name: pkg.name, version: '0.1.0' }, null, 2),
    },
    {
      path: `${pkg.path}/src/index.ts`,
      content: `export const name = '${pkg.name}';\nexport const ready = true;\n`,
    },
    { path: `${pkg.path}/logo.png`, content: '', binary: true },
  ];
}

const loadPackageFiles = (pkg: Package) =>
  Effect.succeed({ files: packageFiles(pkg) });

const knownFiles = analysis.packages.flatMap((pkg) =>
  packageFiles(pkg).map(({ path }) => path),
);

const [changedPackage, newPackage] = analysis.packages;

const changes: ChangeSet = {
  baseRef: 'HEAD',
  files: [
    {
      path: `${changedPackage!.path}/src/index.ts`,
      status: 'modified',
      committed: false,
      uncommitted: true,
    },
    ...packageFiles(newPackage!).map(({ path }) => ({
      path,
      status: 'added' as const,
      committed: false,
      uncommitted: true,
    })),
  ],
};

const loadFileDiff = (path: string) =>
  Effect.succeed<FileDiff>({
    path,
    hunks: [
      {
        header: '@@ -1,2 +1,2 @@',
        oldStart: 1,
        newStart: 1,
        lines: [
          {
            kind: 'context',
            content: `export const name = '${changedPackage!.name}';`,
            oldNumber: 1,
            newNumber: 1,
          },
          {
            kind: 'removed',
            content: 'export const ready = false;',
            oldNumber: 2,
          },
          {
            kind: 'added',
            content: 'export const ready = true;',
            newNumber: 2,
          },
        ],
      },
    ],
  });

function WithChanges() {
  const [baseRef, setBaseRef] = useState('HEAD');
  return (
    <Monoverse
      className="flex-1"
      monorepoPath="/repo"
      loadAnalysis={() => Effect.succeed(analysis)}
      renderLaymos={renderLaymos}
      readmeDocuments={readmeDocuments}
      loadPackageFiles={loadPackageFiles}
      changes={{ ...changes, baseRef }}
      knownFiles={knownFiles}
      branches={[
        { name: 'main', remote: false, current: false },
        { name: 'feature', remote: false, current: true },
      ]}
      baseRef={baseRef}
      onBaseRefChange={setBaseRef}
      loadFileDiff={loadFileDiff}
    />
  );
}

function Frame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-muted/20 p-6">{children}</div>
  );
}

export default {
  monorepo: (
    <Frame>
      <Monoverse
        className="flex-1"
        monorepoPath="/repo"
        loadAnalysis={() => Effect.succeed(analysis)}
        renderLaymos={renderLaymos}
        readmeDocuments={readmeDocuments}
        loadPackageFiles={loadPackageFiles}
      />
    </Frame>
  ),
  'git changes': (
    <Frame>
      <WithChanges />
    </Frame>
  ),
  'slow load': (
    <Frame>
      <Monoverse
        className="flex-1"
        monorepoPath="/repo"
        loadAnalysis={() =>
          Effect.succeed(analysis).pipe(Effect.delay('2 seconds'))
        }
        renderLaymos={renderLaymos}
        loadPackageFiles={loadPackageFiles}
      />
    </Frame>
  ),
  'load failure': (
    <Frame>
      <Monoverse
        className="flex-1"
        monorepoPath="/not-a-monorepo"
        loadAnalysis={() =>
          Effect.fail({
            _tag: 'NotAMonorepo',
            path: '/not-a-monorepo',
            reason: 'No pnpm-workspace.yaml at this root',
          })
        }
        renderLaymos={renderLaymos}
        loadPackageFiles={loadPackageFiles}
      />
    </Frame>
  ),
  'no packages': (
    <Frame>
      <Monoverse
        className="flex-1"
        monorepoPath="/repo"
        loadAnalysis={() =>
          Effect.succeed({ ...analysis, packages: [], violations: [] })
        }
        renderLaymos={renderLaymos}
        loadPackageFiles={loadPackageFiles}
      />
    </Frame>
  ),
};
