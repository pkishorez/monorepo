import { useEffect, useMemo, useRef } from 'react';

import { FileIcon, FolderIcon } from '@monorepo/frontend/lib/lucide';
import { cn } from '@monorepo/frontend/lib/utils';

import type { Layer, LayerInteraction } from '../../analysis-presentation';
import { layerCount, layerEmptyState, layerRow } from '../presentation';
import { buildScopeHierarchy, type ScopeNode } from './hierarchy';
import { centerInNearestScrollContainer } from './scrolling';
import {
  architectureTreeBoundary,
  architectureTreeBoundaryIcon,
  architectureTreeBoundaryKind,
  architectureTreeBoundaryState,
  architectureTreeBranch,
  architectureTreeGuide,
  architectureTreeGuideIndent,
  architectureTreeIndent,
  architectureTreeList,
  architectureTreeSelectedStyle,
} from '../../architecture-tree';

interface LayerScopeTreeProps extends Pick<
  LayerInteraction,
  'activeLayerId' | 'onLayerActivate'
> {
  readonly layers: readonly Layer[];
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function LayerScopeTree({
  layers,
  activeLayerId,
  onLayerActivate,
  className,
  ariaLabel = 'Layer scopes',
}: LayerScopeTreeProps) {
  const nodes = useMemo(() => buildScopeHierarchy(layers), [layers]);
  const scopeElements = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (activeLayerId === undefined) return;
    const firstScope = [...scopeElements.current.values()].find(
      (element) => element.dataset.layerId === activeLayerId,
    );
    if (firstScope !== undefined) centerInNearestScrollContainer(firstScope);
  }, [activeLayerId]);

  const registerScope = (path: string, element: HTMLButtonElement | null) => {
    if (element === null) scopeElements.current.delete(path);
    else scopeElements.current.set(path, element);
  };

  return (
    <div className={className} aria-label={ariaLabel}>
      {nodes.length === 0 ? (
        <p className={layerEmptyState}>No layer scopes</p>
      ) : (
        <ScopeNodes
          nodes={nodes}
          focusedLayerId={activeLayerId}
          onLayerActivate={onLayerActivate}
          onScopeElementChange={registerScope}
        />
      )}
    </div>
  );
}

function ScopeNodes({
  nodes,
  nested = false,
  depth = 0,
  focusedLayerId,
  onLayerActivate,
  onScopeElementChange,
}: {
  readonly nodes: readonly ScopeNode[];
  readonly nested?: boolean;
  readonly depth?: number;
  readonly focusedLayerId?: string;
  readonly onLayerActivate?: (layerId: string) => void;
  readonly onScopeElementChange: (
    path: string,
    element: HTMLButtonElement | null,
  ) => void;
}) {
  return (
    <ul className={architectureTreeList} role={nested ? 'group' : 'tree'}>
      {nodes.map((node) => (
        <ScopeRow
          key={node.path}
          node={node}
          depth={depth}
          focusedLayerId={focusedLayerId}
          onLayerActivate={onLayerActivate}
          onScopeElementChange={onScopeElementChange}
        />
      ))}
    </ul>
  );
}

function ScopeRow({
  node,
  depth,
  focusedLayerId,
  onLayerActivate,
  onScopeElementChange,
}: {
  readonly node: ScopeNode;
  readonly depth: number;
  readonly focusedLayerId?: string;
  readonly onLayerActivate?: (layerId: string) => void;
  readonly onScopeElementChange: (
    path: string,
    element: HTMLButtonElement | null,
  ) => void;
}) {
  const layerId = node.layerId;
  const isScope = layerId !== undefined;
  const highlighted = isScope && focusedLayerId === layerId;
  const dimmed = isScope && focusedLayerId !== undefined && !highlighted;
  const state = highlighted ? 'selected' : dimmed ? 'dimmed' : 'neutral';
  const Icon =
    node.children.length > 0 || !node.name.includes('.')
      ? FolderIcon
      : FileIcon;
  const indentation = architectureTreeIndent(depth);

  return (
    <li role="treeitem" aria-label={node.path}>
      {layerId === undefined ? (
        <div
          className={architectureTreeBranch}
          style={{ paddingInlineStart: indentation }}
        >
          <Icon className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{node.name}</span>
        </div>
      ) : (
        <button
          ref={(element) => onScopeElementChange(node.path, element)}
          type="button"
          data-layer-id={layerId}
          style={{
            paddingInlineStart: indentation,
            ...(state === 'selected' ? architectureTreeSelectedStyle() : {}),
          }}
          className={cn(
            layerRow,
            architectureTreeBoundary,
            'focus-visible:ring-2 focus-visible:ring-ring/40',
            architectureTreeBoundaryKind('layer'),
            architectureTreeBoundaryState(state),
          )}
          onClick={() => onLayerActivate?.(layerId)}
        >
          <span className={architectureTreeBoundaryIcon('layer', state)}>
            <Icon className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span
            className={layerCount}
            aria-label={`${node.fileCount} ${node.fileCount === 1 ? 'file' : 'files'}`}
            title={`${node.fileCount} ${node.fileCount === 1 ? 'file' : 'files'}`}
          >
            {node.fileCount}
          </span>
        </button>
      )}

      {node.children.length > 0 && (
        <div className="relative">
          <span
            aria-hidden
            className={architectureTreeGuide}
            style={{ insetInlineStart: architectureTreeGuideIndent(depth) }}
          />
          <ScopeNodes
            nodes={node.children}
            nested
            depth={depth + 1}
            focusedLayerId={focusedLayerId}
            onLayerActivate={onLayerActivate}
            onScopeElementChange={onScopeElementChange}
          />
        </div>
      )}
    </li>
  );
}
