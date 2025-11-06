import { createFileRoute } from '@tanstack/react-router';
import { ReactFlow, Background, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useState } from 'react';

import { allSchemas } from './-private/schema';
import { buildFlowData } from './-private/schema-to-flow';
import { DatabaseSchemaNode, HoverContext } from './-private/components';

export const Route = createFileRoute('/schema-visualiser')({
  component: RouteComponent,
});

// Generate nodes and edges from schemas
const { nodes, edges } = buildFlowData(allSchemas);

const nodeTypes = {
  databaseSchema: DatabaseSchemaNode,
};

function RouteComponent() {
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(
    null,
  );

  const handleEdgeMouseEnter = (_: any, edge: Edge) => {
    setHoveredConnection(
      `${edge.source}:${edge.sourceHandle}-${edge.target}:${edge.targetHandle}`,
    );
  };

  const handleEdgeMouseLeave = () => {
    setHoveredConnection(null);
  };

  // Update edge styles based on hover
  const styledEdges = edges.map((edge) => {
    const isHovered =
      hoveredConnection ===
      `${edge.source}:${edge.sourceHandle}-${edge.target}:${edge.targetHandle}`;

    return {
      ...edge,
      type: 'smoothstep',
      style: {
        ...edge.style,
        stroke: isHovered ? '#3b82f6' : '#f59e0b',
        strokeWidth: isHovered ? 3 : 2,
        opacity: isHovered ? 1 : 0.6,
      },
      animated: isHovered,
      markerEnd: {
        type: 'arrowclosed' as const,
        color: isHovered ? '#3b82f6' : '#f59e0b',
        width: 20,
        height: 20,
      },
    };
  });

  return (
    <HoverContext.Provider value={{ hoveredConnection, setHoveredConnection }}>
      <div className="h-screen w-full bg-gradient-to-br from-slate-50 to-gray-100">
        <ReactFlow
          nodesDraggable={false}
          panOnDrag={false}
          defaultNodes={nodes}
          edges={styledEdges}
          nodeTypes={nodeTypes}
          onEdgeMouseEnter={handleEdgeMouseEnter}
          onEdgeMouseLeave={handleEdgeMouseLeave}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
        >
          <Background
            color="#cbd5e1"
            gap={16}
            size={1}
          />
        </ReactFlow>
      </div>
    </HoverContext.Provider>
  );
}
