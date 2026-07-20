import {
  FileIcon,
  FolderIcon,
  FolderMinusIcon,
  FolderOpenIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { cn } from '#lib/utils';

type TreeNode = {
  path: string;
  name: string;
  children: TreeNode[] | null;
};

type Emphasis = 'highlighted' | 'dimmed' | null;

type FileTreeProps = {
  files: string[];
  expanded: string[];
  onExpandedChange: (expanded: string[]) => void;
  highlightedPaths?: string[];
  dimmedPaths?: string[];
  /** Dim every row that is neither highlighted nor an ancestor of a highlight. */
  dimOthers?: boolean;
  onPathClick?: (path: string) => void;
  renderSuffix?: (path: string) => ReactNode;
  classNameForPath?: (path: string) => string | undefined;
  /** Accent for the leading icon only — a second signal independent of row text. */
  iconClassNameForPath?: (path: string) => string | undefined;
  className?: string;
};

const collator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode = { path: '', name: '', children: [] };
  const byPath = new Map<string, TreeNode>([['', root]]);
  for (const file of files) {
    // A trailing slash declares an explicit (possibly empty) folder.
    const isExplicitFolder = file.endsWith('/');
    const segments = (isExplicitFolder ? file.slice(0, -1) : file).split('/');
    let parent = root;
    for (let i = 0; i < segments.length; i++) {
      const path = segments.slice(0, i + 1).join('/');
      let node = byPath.get(path);
      if (!node) {
        node = {
          path,
          name: segments[i]!,
          children: i < segments.length - 1 || isExplicitFolder ? [] : null,
        };
        byPath.set(path, node);
        parent.children!.push(node);
      }
      if (node.children) parent = node;
    }
  }
  sortTree(root.children!);
  return root.children!;
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if ((a.children !== null) !== (b.children !== null)) {
      return a.children !== null ? -1 : 1;
    }
    return collator.compare(a.name, b.name);
  });
  for (const node of nodes) {
    if (node.children) sortTree(node.children);
  }
}

function longestPrefixLength(path: string, prefixes: string[]): number {
  let best = -1;
  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      best = Math.max(best, prefix.length);
    }
  }
  return best;
}

export function FileTree({
  files,
  expanded,
  onExpandedChange,
  highlightedPaths = [],
  dimmedPaths = [],
  dimOthers = false,
  onPathClick,
  renderSuffix,
  classNameForPath,
  iconClassNameForPath,
  className,
}: FileTreeProps) {
  const roots = useMemo(() => buildTree(files), [files]);
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);

  // Longest matching prefix wins; on a tie, highlight beats dim.
  const emphasisFor = (path: string): Emphasis => {
    const highlight = longestPrefixLength(path, highlightedPaths);
    const dim = longestPrefixLength(path, dimmedPaths);
    if (highlight >= 0 || dim >= 0) {
      return highlight >= dim ? 'highlighted' : 'dimmed';
    }
    if (!dimOthers) return null;
    const isAncestorOfHighlight = highlightedPaths.some((prefix) =>
      prefix.startsWith(`${path}/`),
    );
    return isAncestorOfHighlight ? null : 'dimmed';
  };

  const toggle = (path: string) => {
    onExpandedChange(
      expandedSet.has(path)
        ? expanded.filter((item) => item !== path)
        : [...expanded, path],
    );
  };

  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    const isFolder = node.children !== null;
    const isEmptyFolder = isFolder && node.children!.length === 0;
    const isExpanded = isFolder && !isEmptyFolder && expandedSet.has(node.path);
    const emphasis = emphasisFor(node.path);
    const Icon = isEmptyFolder
      ? FolderMinusIcon
      : isFolder
        ? isExpanded
          ? FolderOpenIcon
          : FolderIcon
        : FileIcon;

    return (
      <div key={node.path}>
        <button
          type="button"
          disabled={isEmptyFolder}
          aria-expanded={isFolder && !isEmptyFolder ? isExpanded : undefined}
          style={{ paddingInlineStart: `${depth * 1 + 0.25}rem` }}
          onClick={() => {
            if (isFolder) toggle(node.path);
            onPathClick?.(node.path);
          }}
          className={cn(
            'flex w-full min-w-0 select-none items-center gap-1.5 rounded-md py-0.5 pe-1 text-sm',
            isEmptyFolder
              ? 'cursor-default text-muted-foreground'
              : 'cursor-pointer hover:bg-accent/50',
            emphasis === 'highlighted' && 'bg-primary/10 text-primary',
            emphasis === 'dimmed' && 'opacity-40',
            classNameForPath?.(node.path),
          )}
        >
          <Icon
            className={cn('size-4 shrink-0', iconClassNameForPath?.(node.path))}
          />
          <span title={node.name} className="min-w-0 truncate">
            {node.name}
          </span>
          {renderSuffix ? (
            <span className="ms-auto flex shrink-0 items-center">
              {renderSuffix(node.path)}
            </span>
          ) : null}
        </button>
        {isExpanded ? (
          <div className="relative">
            <span
              aria-hidden
              className="absolute inset-y-0 w-px bg-border"
              style={{ insetInlineStart: `${depth + 0.7}rem` }}
            />
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={cn('flex flex-col gap-px', className)}>
      {roots.map((node) => renderNode(node, 0))}
    </div>
  );
}
