import { memo, useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useHoverContext } from './HoverContext';

interface FieldSchema {
  title: string;
  type: string;
}

interface DatabaseSchemaNodeData {
  label: string;
  schema: FieldSchema[];
}

interface DatabaseSchemaNodeProps {
  data: DatabaseSchemaNodeData;
  id: string;
}

export const DatabaseSchemaNode = memo<DatabaseSchemaNodeProps>(
  ({ data, id }) => {
    const [isCardHovered, setIsCardHovered] = useState(false);
    const { getEdges } = useReactFlow();
    const { hoveredConnection, setHoveredConnection } = useHoverContext();

    const isFieldConnected = (fieldId: string) => {
      const edges = getEdges();
      return edges.some(
        (edge) =>
          (edge.source === id && edge.sourceHandle === fieldId) ||
          (edge.target === id && edge.targetHandle === fieldId),
      );
    };

    const getConnectionString = (fieldId: string) => {
      const edges = getEdges();
      const edge = edges.find(
        (e) =>
          (e.source === id && e.sourceHandle === fieldId) ||
          (e.target === id && e.targetHandle === fieldId),
      );
      if (!edge) return null;
      return `${edge.source}:${edge.sourceHandle}-${edge.target}:${edge.targetHandle}`;
    };

    const isFieldHighlighted = (fieldId: string) => {
      if (!hoveredConnection) return false;
      return hoveredConnection.includes(`${id}:${fieldId}`);
    };

    return (
      <div
        className="bg-white border-2 border-gray-300 rounded-lg shadow-lg min-w-[200px]"
        onMouseEnter={() => setIsCardHovered(true)}
        onMouseLeave={() => setIsCardHovered(false)}
      >
        <div className="bg-gray-100 px-4 py-2 font-bold border-b-2 border-gray-300">
          {data.label}
        </div>
        <div className="p-2">
          {data.schema.map((field) => {
            const isConnected = isFieldConnected(field.title);
            const isHighlighted = isFieldHighlighted(field.title);
            const connectionString = getConnectionString(field.title);

            return (
              <div
                key={field.title}
                className={`flex justify-between py-1 px-2 text-sm border-b border-gray-200 last:border-b-0 relative transition-all duration-200 ${
                  isConnected ? 'cursor-pointer' : ''
                } ${isHighlighted ? 'bg-blue-100 scale-105' : isConnected ? 'hover:bg-gray-50' : ''}`}
                onMouseEnter={() => {
                  if (isConnected && connectionString) {
                    setHoveredConnection(connectionString);
                  }
                }}
                onMouseLeave={() => {
                  if (isConnected) {
                    setHoveredConnection(null);
                  }
                }}
              >
                <Handle
                  type="target"
                  position={Position.Left}
                  id={field.title}
                  className="!w-2 !h-2 !bg-transparent !border-0 opacity-0"
                />
                <span
                  className={`font-medium transition-all ${isHighlighted ? 'text-blue-600 font-bold' : ''}`}
                >
                  {field.title}
                </span>
                {isCardHovered && (
                  <span className="text-gray-600 ml-4">{field.type}</span>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={field.title}
                  className="!w-2 !h-2 !bg-transparent !border-0 opacity-0"
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

DatabaseSchemaNode.displayName = 'DatabaseSchemaNode';
