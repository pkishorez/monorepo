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
  const styledEdges = edges.map((edge) => ({
    ...edge,
    style: {
      ...edge.style,
      stroke:
        hoveredConnection ===
        `${edge.source}:${edge.sourceHandle}-${edge.target}:${edge.targetHandle}`
          ? '#2563eb'
          : '#b1b1b7',
      strokeWidth:
        hoveredConnection ===
        `${edge.source}:${edge.sourceHandle}-${edge.target}:${edge.targetHandle}`
          ? 3
          : 2,
    },
    animated:
      hoveredConnection ===
      `${edge.source}:${edge.sourceHandle}-${edge.target}:${edge.targetHandle}`,
  }));

  return (
    <HoverContext.Provider value={{ hoveredConnection, setHoveredConnection }}>
      <div className="h-screen w-full">
        <ReactFlow
          nodesDraggable={false}
          panOnDrag={false}
          defaultNodes={nodes}
          edges={styledEdges}
          nodeTypes={nodeTypes}
          onEdgeMouseEnter={handleEdgeMouseEnter}
          onEdgeMouseLeave={handleEdgeMouseLeave}
          fitView
          fitViewOptions={{ maxZoom: 1 }}
        >
          <Background />
        </ReactFlow>
      </div>
    </HoverContext.Provider>
  );
}
