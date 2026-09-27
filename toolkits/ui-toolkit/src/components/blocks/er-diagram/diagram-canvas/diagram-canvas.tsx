import '@xyflow/react/dist/style.css';

import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type NodeTypes,
} from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '#lib/utils';

import type { layoutGraph } from '../graph-layout';
import { EntityNode } from './entity-node';
import { applyRelationshipFocus } from './relationship-focus';

type Layout = Awaited<ReturnType<typeof layoutGraph>>;
type Focus = Parameters<typeof applyRelationshipFocus>[0];
type Hover = Parameters<typeof applyRelationshipFocus>[3];

const nodeTypes = { entity: EntityNode } satisfies NodeTypes;

export function DiagramCanvas({
  layout,
  className,
  ariaLabel,
  onComplexFieldOpen,
}: {
  readonly layout: Layout;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly onComplexFieldOpen?: (entityId: string, fieldName: string) => void;
}) {
  return (
    <ReactFlowProvider key={layout.id}>
      <CanvasBody
        layout={layout}
        className={className}
        ariaLabel={ariaLabel}
        onComplexFieldOpen={onComplexFieldOpen}
      />
    </ReactFlowProvider>
  );
}

function CanvasBody({
  layout,
  className,
  ariaLabel,
  onComplexFieldOpen,
}: {
  readonly layout: Layout;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly onComplexFieldOpen?: (entityId: string, fieldName: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);
  const [focus, setFocus] = useState<Focus>();
  const [hover, setHover] = useState<Hover>();

  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
    setFocus(undefined);
    setHover(undefined);
  }, [layout, setEdges, setNodes]);

  const focused = useMemo(
    () => applyRelationshipFocus(focus, nodes, edges, hover),
    [edges, focus, hover, nodes],
  );
  const interactiveNodes = useMemo(
    () =>
      focused.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onEntitySelect: (entityId: string) => {
            setHover(undefined);
            setFocus((current) =>
              current?.kind === 'entity' && current.entityId === entityId
                ? undefined
                : { kind: 'entity', entityId },
            );
          },
          onFieldSelect: (entityId: string, fieldName: string) => {
            setHover(undefined);
            setFocus((current) =>
              current?.kind === 'field' &&
              current.entityId === entityId &&
              current.fieldName === fieldName
                ? undefined
                : { kind: 'field', entityId, fieldName },
            );
          },
          onComplexFieldOpen: (entityId: string, fieldName: string) => {
            setFocus(undefined);
            setHover(undefined);
            onComplexFieldOpen?.(entityId, fieldName);
          },
          onEntityHover: (entityId: string, active: boolean) => {
            setHover(active ? { kind: 'entity', entityId } : undefined);
          },
          onFieldHover: (
            entityId: string,
            fieldName: string,
            active: boolean,
          ) => {
            setHover(
              active
                ? { kind: 'field', entityId, fieldName }
                : { kind: 'entity', entityId },
            );
          },
        },
      })),
    [focused.nodes, onComplexFieldOpen],
  );

  return (
    <div
      role="region"
      className={cn(
        'h-[560px] min-h-80 w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm',
        className,
      )}
      aria-label={ariaLabel ?? 'Entity relationship diagram'}
    >
      <ReactFlow
        nodes={interactiveNodes}
        edges={focused.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => setFocus(undefined)}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        minZoom={0.18}
        maxZoom={1.8}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          className="opacity-45"
          color="var(--border)"
          gap={24}
          size={1}
        />
        <Controls
          showInteractive={false}
          className="!overflow-hidden !rounded-lg !border-border !bg-background/95 !shadow-md backdrop-blur-sm [&>button]:!border-border [&>button]:!bg-transparent [&>button]:!fill-foreground [&>button:hover]:!bg-muted"
        />
      </ReactFlow>
    </div>
  );
}
