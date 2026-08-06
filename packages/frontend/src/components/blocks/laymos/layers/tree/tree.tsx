import { useEffect, useMemo, useRef } from 'react';

import { FileIcon, FolderIcon } from '#lib/lucide';
import { cn } from '#lib/utils';

import { resolveLayerFocus } from '../focus';
import type { Layer, LayerInteraction } from '../model';
import { layerCount, layerEmptyState, layerRow } from '../presentation';
import { buildScopeHierarchy, type ScopeNode } from './hierarchy';
import { centerInNearestScrollContainer } from './scrolling';

interface LayerScopeTreeProps extends LayerInteraction {
  readonly layers: readonly Layer[];
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function LayerScopeTree({
  layers,
  activeLayerId,
  hoveredLayerId,
  onLayerHoverChange,
  onLayerActivate,
  className,
  ariaLabel = 'Layer scopes',
}: LayerScopeTreeProps) {
  const nodes = useMemo(() => buildScopeHierarchy(layers), [layers]);
  const focus = resolveLayerFocus({ activeLayerId, hoveredLayerId });
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
          focusedLayerId={focus.focusedLayerId}
          hoverEnabled={focus.hoverEnabled}
          onLayerHoverChange={onLayerHoverChange}
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
  hoverEnabled,
  onLayerHoverChange,
  onLayerActivate,
  onScopeElementChange,
}: {
  readonly nodes: readonly ScopeNode[];
  readonly nested?: boolean;
  readonly depth?: number;
  readonly focusedLayerId?: string;
  readonly hoverEnabled: boolean;
  readonly onLayerHoverChange?: (layerId: string | undefined) => void;
  readonly onLayerActivate?: (layerId: string) => void;
  readonly onScopeElementChange: (
    path: string,
    element: HTMLButtonElement | null,
  ) => void;
}) {
  return (
    <ul className="space-y-px" role={nested ? 'group' : 'tree'}>
      {nodes.map((node) => (
        <ScopeRow
          key={node.path}
          node={node}
          depth={depth}
          focusedLayerId={focusedLayerId}
          hoverEnabled={hoverEnabled}
          onLayerHoverChange={onLayerHoverChange}
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
  hoverEnabled,
  onLayerHoverChange,
  onLayerActivate,
  onScopeElementChange,
}: {
  readonly node: ScopeNode;
  readonly depth: number;
  readonly focusedLayerId?: string;
  readonly hoverEnabled: boolean;
  readonly onLayerHoverChange?: (layerId: string | undefined) => void;
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
  const Icon =
    node.children.length > 0 || !node.name.includes('.')
      ? FolderIcon
      : FileIcon;
  const indentation = `${depth * 0.8 + 0.25}rem`;

  return (
    <li role="treeitem" aria-label={node.path}>
      {layerId === undefined ? (
        <div
          className="flex h-7 min-w-0 items-center gap-1.5 pe-1 font-mono text-xs text-muted-foreground/70"
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
          style={{ paddingInlineStart: indentation }}
          className={cn(
            layerRow,
            'h-8 gap-1.5 pe-1.5 font-mono text-xs font-medium text-foreground hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40',
            highlighted && 'bg-primary/10 ring-1 ring-inset ring-primary/30',
            dimmed && 'opacity-15',
          )}
          onPointerEnter={() => {
            if (hoverEnabled) onLayerHoverChange?.(layerId);
          }}
          onPointerLeave={() => {
            if (hoverEnabled) onLayerHoverChange?.(undefined);
          }}
          onFocus={() => {
            if (hoverEnabled) onLayerHoverChange?.(layerId);
          }}
          onBlur={() => {
            if (hoverEnabled) onLayerHoverChange?.(undefined);
          }}
          onClick={() => {
            onLayerHoverChange?.(undefined);
            onLayerActivate?.(layerId);
          }}
        >
          <span className="grid size-5 shrink-0 place-items-center rounded bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
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
            className="absolute inset-y-0 w-px bg-border/70"
            style={{ insetInlineStart: `${depth * 0.8 + 0.68}rem` }}
          />
          <ScopeNodes
            nodes={node.children}
            nested
            depth={depth + 1}
            focusedLayerId={focusedLayerId}
            hoverEnabled={hoverEnabled}
            onLayerHoverChange={onLayerHoverChange}
            onLayerActivate={onLayerActivate}
            onScopeElementChange={onScopeElementChange}
          />
        </div>
      )}
    </li>
  );
}
