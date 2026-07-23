import dagre from '@dagrejs/dagre';
import {
  Background,
  Handle,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Box, Layers, Network } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  ProjectMap,
  ProjectNarrative as ProjectNarrativeArtifact,
  ProjectReference,
  ProjectTopic,
} from 'laymos/report';

import { cn } from '#lib/utils';

import { RichMarkdown } from './rich-markdown';

interface ProjectTopicData extends Record<string, unknown> {
  readonly topic: ProjectTopic;
  readonly selected: boolean;
  readonly onReferenceClick?: (reference: ProjectReference) => void;
}

const referenceLabel = (reference: ProjectReference): string =>
  reference.kind === 'module' ? reference.path : reference.name;

function Reference({
  reference,
  onReferenceClick,
}: {
  readonly reference: ProjectReference;
  readonly onReferenceClick?: (reference: ProjectReference) => void;
}) {
  const Icon =
    reference.kind === 'layer-graph'
      ? Network
      : reference.kind === 'layer'
        ? Layers
        : Box;
  const content = (
    <>
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{referenceLabel(reference)}</span>
      <span className="ml-auto text-[9px] capitalize text-muted-foreground">
        {reference.kind.replace('-', ' ')}
      </span>
    </>
  );
  return onReferenceClick ? (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-xs hover:border-primary/45 hover:bg-muted/40"
      onClick={() => onReferenceClick(reference)}
    >
      {content}
    </button>
  ) : (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
      {content}
    </div>
  );
}

function ProjectTopicNode({ data }: NodeProps<Node<ProjectTopicData>>) {
  return (
    <div
      className={cn(
        'flex h-full w-full items-center gap-2 rounded-lg border bg-background px-3 text-xs font-medium shadow-sm transition',
        data.selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border hover:border-primary/45',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-1 !border-background !bg-muted-foreground"
      />
      <Box className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{data.topic.title}</span>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-1 !border-background !bg-muted-foreground"
      />
      <NodeToolbar
        isVisible={data.selected}
        position={Position.Right}
        offset={14}
        className="nodrag nopan nowheel"
      >
        <aside className="max-h-96 w-80 overflow-y-auto rounded-lg border border-border bg-popover p-4 text-left text-popover-foreground shadow-xl">
          <p className="text-sm font-semibold">{data.topic.title}</p>
          <RichMarkdown className="mt-3 text-xs prose-p:leading-5">
            {data.topic.description}
          </RichMarkdown>
          {data.topic.references.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Architecture references
              </p>
              {data.topic.references.map((reference, index) => (
                <Reference
                  key={`${reference.kind}:${referenceLabel(reference)}:${index}`}
                  reference={reference}
                  onReferenceClick={data.onReferenceClick}
                />
              ))}
            </div>
          )}
        </aside>
      </NodeToolbar>
    </div>
  );
}

const nodeTypes = { projectTopic: ProjectTopicNode };

export function layoutProjectMap(
  map: ProjectMap,
  selectedId: string | null,
  onReferenceClick?: (reference: ProjectReference) => void,
): { readonly nodes: Node<ProjectTopicData>[]; readonly edges: Edge[] } {
  const nodes: Node<ProjectTopicData>[] = [];
  const edges: Edge[] = [];
  const visit = (
    topic: ProjectTopic,
    path: readonly string[],
    parentId?: string,
  ) => {
    const nextPath = [...path, topic.title];
    const id = nextPath.join('\u001f');
    nodes.push({
      id,
      type: 'projectTopic',
      position: { x: 0, y: 0 },
      data: {
        topic,
        selected: selectedId === id,
        ...(onReferenceClick ? { onReferenceClick } : {}),
      },
    });
    if (parentId !== undefined) {
      edges.push({ id: `${parentId}:${id}`, source: parentId, target: id });
    }
    for (const child of topic.children) visit(child, nextPath, id);
  };
  visit(map.root, []);

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'TB', nodesep: 48, ranksep: 64 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, { width: 190, height: 52 });
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);
  for (const node of nodes) {
    const position = graph.node(node.id) as { x: number; y: number };
    node.position = { x: position.x - 95, y: position.y - 26 };
  }
  return { nodes, edges };
}

function ProjectMapView({
  map,
  onReferenceClick,
}: {
  readonly map: ProjectMap;
  readonly onReferenceClick?: (reference: ProjectReference) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const model = useMemo(
    () => layoutProjectMap(map, selectedId, onReferenceClick),
    [map, onReferenceClick, selectedId],
  );
  return (
    <div className="my-8 h-[28rem] overflow-hidden rounded-xl border border-border bg-muted/10">
      <ReactFlowProvider>
        <ReactFlow
          nodes={model.nodes}
          edges={model.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
        >
          <Background gap={20} size={1} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

export function ProjectNarrative({
  project,
  onReferenceClick,
  scrollable = true,
}: {
  readonly project: ProjectNarrativeArtifact;
  readonly onReferenceClick?: (reference: ProjectReference) => void;
  readonly scrollable?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-background',
        scrollable ? 'h-full overflow-y-auto' : 'min-h-full',
      )}
    >
      <article className="mx-auto w-full max-w-5xl px-8 py-12 sm:px-12">
        <h1 className="mb-8 text-3xl font-semibold tracking-tight">
          {project.name}
        </h1>
        {project.blocks.map((block, index) =>
          block.kind === 'markdown' ? (
            <RichMarkdown key={`markdown:${index}`}>
              {block.content}
            </RichMarkdown>
          ) : (
            <ProjectMapView
              key={`map:${index}`}
              map={block}
              onReferenceClick={onReferenceClick}
            />
          ),
        )}
      </article>
    </div>
  );
}
