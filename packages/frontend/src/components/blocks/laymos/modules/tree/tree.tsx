import { FileIcon, FolderIcon } from '#lib/lucide';
import { cn } from '#lib/utils';

import { ChangeBadge } from '../../change-presentation';
import type { ChangeStatus, Module, ModuleViolation } from '../model';
import {
  architectureTreeBoundary,
  architectureTreeBoundaryIcon,
  architectureTreeBoundaryKind,
  architectureTreeBoundaryState,
  architectureTreeBranch,
  architectureTreeIndent,
  architectureTreeList,
  architectureTreeSelectedStyle,
} from '../../tree/presentation';

interface ModuleTreeProps {
  readonly modules: readonly Module[];
  readonly layerIdsByPath?: ReadonlyMap<string, string>;
  readonly activeLayerId?: string;
  readonly activeModuleId?: string;
  readonly highlightedModuleIds?: ReadonlySet<string>;
  readonly activeViolation?: ModuleViolation;
  readonly onLayerActivate?: (layerId: string) => void;
  readonly onModuleActivate?: (moduleId: string) => void;
  readonly onModuleOpen?: (moduleId: string) => void;
  readonly className?: string;
}

interface ModuleTreeNode {
  readonly name: string;
  readonly path: string;
  readonly moduleId?: string;
  readonly children: readonly ModuleTreeNode[];
}

export function ModuleTree({
  modules,
  layerIdsByPath = new Map(),
  activeLayerId,
  activeModuleId,
  highlightedModuleIds = new Set(),
  activeViolation,
  onLayerActivate,
  onModuleActivate,
  onModuleOpen,
  className,
}: ModuleTreeProps) {
  const violationModuleIds = modulesForViolation(activeViolation);
  const changeStatusByModuleId = new Map(
    modules.flatMap(({ id, changeStatus }) =>
      changeStatus === undefined ? [] : [[id, changeStatus] as const],
    ),
  );
  return (
    <div className={className} aria-label="Project Modules">
      <ModuleNodes
        nodes={buildModuleTree(modules)}
        changeStatusByModuleId={changeStatusByModuleId}
        layerIdsByPath={layerIdsByPath}
        activeLayerId={activeLayerId}
        activeModuleId={activeModuleId}
        highlightedModuleIds={highlightedModuleIds}
        violationModuleIds={violationModuleIds}
        onLayerActivate={onLayerActivate}
        onModuleActivate={onModuleActivate}
        onModuleOpen={onModuleOpen}
      />
    </div>
  );
}

function ModuleNodes({
  nodes,
  layerIdsByPath,
  depth = 0,
  activeLayerId,
  activeModuleId,
  highlightedModuleIds,
  violationModuleIds,
  changeStatusByModuleId,
  onLayerActivate,
  onModuleActivate,
  onModuleOpen,
}: {
  readonly nodes: readonly ModuleTreeNode[];
  readonly changeStatusByModuleId: ReadonlyMap<string, ChangeStatus>;
  readonly layerIdsByPath: ReadonlyMap<string, string>;
  readonly depth?: number;
  readonly activeLayerId?: string;
  readonly activeModuleId?: string;
  readonly highlightedModuleIds: ReadonlySet<string>;
  readonly violationModuleIds: ReadonlySet<string>;
  readonly onLayerActivate?: (layerId: string) => void;
  readonly onModuleActivate?: (moduleId: string) => void;
  readonly onModuleOpen?: (moduleId: string) => void;
}) {
  return (
    <ul className={architectureTreeList} role={depth === 0 ? 'tree' : 'group'}>
      {nodes.map((node) => {
        const layerId = layerIdsByPath.get(node.path);
        const isLayer = layerId !== undefined;
        const isModule = node.moduleId !== undefined;
        const primary =
          (node.moduleId !== undefined && node.moduleId === activeModuleId) ||
          (layerId !== undefined && layerId === activeLayerId);
        const related =
          node.moduleId !== undefined &&
          highlightedModuleIds.has(node.moduleId);
        const violation =
          node.moduleId !== undefined && violationModuleIds.has(node.moduleId);
        const dimmed =
          (isLayer || isModule) &&
          (activeLayerId !== undefined ||
            activeModuleId !== undefined ||
            violationModuleIds.size > 0) &&
          !primary &&
          !related &&
          !violation;
        const state = primary
          ? 'selected'
          : violation
            ? 'violation'
            : related
              ? 'related'
              : dimmed
                ? 'dimmed'
                : 'neutral';
        const changeStatus =
          node.moduleId === undefined
            ? undefined
            : changeStatusByModuleId.get(node.moduleId);
        const Icon =
          node.children.length > 0 || !node.name.includes('.')
            ? FolderIcon
            : FileIcon;
        return (
          <li key={node.path} role="treeitem" aria-label={node.path}>
            <button
              type="button"
              disabled={!isLayer && !isModule}
              className={cn(
                !isModule ? architectureTreeBranch : architectureTreeBoundary,
                'w-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                isLayer && architectureTreeBoundaryKind('layer'),
                isModule && architectureTreeBoundaryKind('module'),
                (isLayer || isModule) && architectureTreeBoundaryState(state),
              )}
              style={{
                paddingInlineStart: architectureTreeIndent(depth),
                ...(state === 'selected'
                  ? architectureTreeSelectedStyle()
                  : {}),
              }}
              onClick={() => {
                if (node.moduleId !== undefined) {
                  onModuleActivate?.(node.moduleId);
                } else if (layerId !== undefined) {
                  onLayerActivate?.(layerId);
                }
              }}
              onContextMenu={(event) => {
                if (node.moduleId === undefined) return;
                event.preventDefault();
                onModuleOpen?.(node.moduleId);
              }}
            >
              {!isModule ? (
                <Icon className="size-3.5 shrink-0" />
              ) : (
                <span
                  className={architectureTreeBoundaryIcon(
                    isLayer ? 'layer' : 'module',
                    state,
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
              )}
              <span className="truncate">{node.name}</span>
              {changeStatus !== undefined && (
                <ChangeBadge status={changeStatus} className="ms-auto" />
              )}
            </button>
            {node.children.length > 0 && (
              <div>
                <ModuleNodes
                  nodes={node.children}
                  changeStatusByModuleId={changeStatusByModuleId}
                  layerIdsByPath={layerIdsByPath}
                  depth={depth + 1}
                  activeLayerId={activeLayerId}
                  activeModuleId={activeModuleId}
                  highlightedModuleIds={highlightedModuleIds}
                  violationModuleIds={violationModuleIds}
                  onLayerActivate={onLayerActivate}
                  onModuleActivate={onModuleActivate}
                  onModuleOpen={onModuleOpen}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function buildModuleTree(
  modules: readonly Module[],
): readonly ModuleTreeNode[] {
  interface MutableNode {
    name: string;
    path: string;
    moduleId?: string;
    children: Map<string, MutableNode>;
  }
  const roots = new Map<string, MutableNode>();
  const entries = modules.map((module) => ({
    path: module.id,
    moduleId: module.id,
  }));

  for (const entry of entries) {
    const parts = entry.path.split('/');
    let children = roots;
    let path = '';
    parts.forEach((name: string, index: number) => {
      path = path === '' ? name : `${path}/${name}`;
      const node: MutableNode = children.get(name) ?? {
        name,
        path,
        children: new Map<string, MutableNode>(),
      };
      if (index === parts.length - 1) node.moduleId = entry.moduleId;
      children.set(name, node);
      children = node.children;
    });
  }

  const freeze = (nodes: ReadonlyMap<string, MutableNode>): ModuleTreeNode[] =>
    [...nodes.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((node) => ({
        name: node.name,
        path: node.path,
        ...(node.moduleId === undefined ? {} : { moduleId: node.moduleId }),
        children: freeze(node.children),
      }));
  return freeze(roots);
}

function modulesForViolation(violation?: ModuleViolation): ReadonlySet<string> {
  if (violation === undefined) return new Set();
  switch (violation.kind) {
    case 'dependency':
    case 'boundary':
      return new Set([violation.fromModuleId, violation.toModuleId]);
    case 'cycle':
      return new Set(violation.moduleIds);
    case 'missing-entry-point':
    case 'unused-shared':
    case 'dead-module':
      return new Set([violation.moduleId]);
    case 'coverage':
    case 'graph-coverage':
      return new Set();
  }
}
