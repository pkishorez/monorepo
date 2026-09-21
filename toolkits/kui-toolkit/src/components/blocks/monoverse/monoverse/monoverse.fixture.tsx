import { Effect } from 'effect';
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
      />
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
      />
    </Frame>
  ),
};
