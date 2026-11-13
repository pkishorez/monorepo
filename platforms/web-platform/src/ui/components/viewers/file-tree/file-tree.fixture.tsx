import { useFixtureInput } from 'react-cosmos/client';
import type { ComponentProps } from 'react';

import { expandAll, expandTo, expandToDepth } from './expand';
import { FileTree } from './file-tree';

const files = [
  'src/app/main.ts',
  'src/app/routes.ts',
  'src/domain/order/order.ts',
  'src/domain/order/order.test.ts',
  'src/domain/user/user.ts',
  'src/lib/util.ts',
  'src/legacy/old-api.ts',
  'src/legacy/keep.ts',
  'README.md',
];

const largeFiles = Array.from({ length: 6 }, (_, m) =>
  Array.from({ length: 8 }, (_, f) => [
    `src/module-${m}/feature-${f}/index.ts`,
    `src/module-${m}/feature-${f}/logic.ts`,
    `src/module-${m}/feature-${f}/logic.test.ts`,
  ]).flat(),
).flat();

type ControlledProps = Omit<
  ComponentProps<typeof FileTree>,
  'expanded' | 'onExpandedChange'
> & { initialExpanded?: string[] };

function Controlled({ initialExpanded = [], ...props }: ControlledProps) {
  const [expanded, setExpanded] = useFixtureInput('expanded', initialExpanded);
  return (
    <FileTree {...props} expanded={expanded} onExpandedChange={setExpanded} />
  );
}

function Interplay() {
  const [expanded, setExpanded] = useFixtureInput(
    'expanded',
    expandToDepth(files, 1),
  );
  const [selected, setSelected] = useFixtureInput<string | null>(
    'selected',
    null,
  );
  return (
    <FileTree
      files={files}
      expanded={expanded}
      onExpandedChange={setExpanded}
      highlightedPaths={selected ? [selected] : []}
      onPathClick={(path) => {
        setSelected(path === selected ? null : path);
        setExpanded([...new Set([...expanded, ...expandTo(files, path)])]);
      }}
    />
  );
}

const ruleCounts: Record<string, number> = {
  'src/domain/order': 2,
  'src/lib/util.ts': 1,
};

export default {
  basic: <Controlled files={files} />,

  'expand to depth 1': (
    <Controlled files={files} initialExpanded={expandToDepth(files, 1)} />
  ),

  'expand all': <Controlled files={files} initialExpanded={expandAll(files)} />,

  'expand to path': (
    <Controlled
      files={files}
      initialExpanded={expandTo(files, 'src/domain/order/order.ts')}
    />
  ),

  highlighted: (
    <Controlled
      files={files}
      initialExpanded={expandAll(files)}
      highlightedPaths={['src/domain', 'README.md']}
    />
  ),

  dimmed: (
    <Controlled
      files={files}
      initialExpanded={expandAll(files)}
      dimmedPaths={['src/legacy']}
    />
  ),

  'longest prefix wins': (
    <Controlled
      files={files}
      initialExpanded={expandAll(files)}
      highlightedPaths={['src', 'src/legacy/keep.ts']}
      dimmedPaths={['src/legacy']}
    />
  ),

  'focus (dim others)': (
    <Controlled
      files={files}
      initialExpanded={expandAll(files)}
      highlightedPaths={['src/domain/order']}
      dimOthers
    />
  ),

  'row colors': (
    <Controlled
      files={files}
      initialExpanded={expandAll(files)}
      classNameForPath={(path) => {
        if (path === 'src/legacy' || path.startsWith('src/legacy/')) {
          return 'bg-red-500/10 text-red-600 dark:text-red-400';
        }
        if (path === 'src/lib' || path.startsWith('src/lib/')) {
          return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
        }
        return undefined;
      }}
    />
  ),

  'icon vs name colors': (
    <Controlled
      files={files}
      initialExpanded={expandAll(files)}
      classNameForPath={(path) =>
        path === 'src/domain' ? 'text-sky-600 dark:text-sky-400' : undefined
      }
      iconClassNameForPath={(path) =>
        path === 'src/domain/order' || path === 'src/lib/util.ts'
          ? 'text-amber-600 dark:text-amber-400'
          : undefined
      }
    />
  ),

  'empty folders': (
    <Controlled
      files={['src/app/main.ts', 'src/empty/', 'assets/', 'docs/notes.md']}
      initialExpanded={expandAll([
        'src/app/main.ts',
        'src/empty/',
        'assets/',
        'docs/notes.md',
      ])}
    />
  ),

  'controlled interplay': <Interplay />,

  'suffix slot': (
    <Controlled
      files={files}
      initialExpanded={expandAll(files)}
      renderSuffix={(path) => {
        const count = ruleCounts[path];
        if (!count) return null;
        return (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full border border-border bg-muted px-1 text-[9px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        );
      }}
    />
  ),

  'large tree': (
    <div className="h-96 overflow-y-auto">
      <Controlled files={largeFiles} initialExpanded={expandAll(largeFiles)} />
    </div>
  ),
};
