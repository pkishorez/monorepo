import { memo } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useHoverContext } from './HoverContext';

interface FieldSchema {
  title: string;
  type: string;
  isOptional: boolean;
  isBranded: boolean;
  brands?: ReadonlyArray<string | symbol>;
  description?: string;
}

interface DatabaseSchemaNodeData {
  label: string;
  schema: FieldSchema[];
}

interface DatabaseSchemaNodeProps {
  data: DatabaseSchemaNodeData;
  id: string;
}

// Type color mappings
const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  uuid: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  varchar: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  int4: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  numeric: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  boolean: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  enum: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
};

const getTypeColor = (type: string) => {
  return TYPE_COLORS[type] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
};

export const DatabaseSchemaNode = memo<DatabaseSchemaNodeProps>(
  ({ data, id }) => {
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
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl min-w-[280px] overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800 text-base">{data.label}</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {data.schema.map((field) => {
            const isConnected = isFieldConnected(field.title);
            const isHighlighted = isFieldHighlighted(field.title);
            const connectionString = getConnectionString(field.title);
            const typeColor = getTypeColor(field.type);

            return (
              <div
                key={field.title}
                className={`relative px-4 py-2.5 transition-all duration-200 ${
                  field.isBranded
                    ? 'bg-amber-50/50 border-l-2 border-amber-400'
                    : ''
                } ${isConnected ? 'cursor-pointer' : ''} ${
                  isHighlighted
                    ? 'bg-blue-100/80 shadow-inner scale-[1.02] z-10'
                    : isConnected
                      ? 'hover:bg-gray-50'
                      : ''
                }`}
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

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className={`font-medium text-sm transition-all ${
                        isHighlighted
                          ? 'text-blue-700 font-semibold'
                          : field.isBranded
                            ? 'text-amber-900'
                            : 'text-gray-700'
                      }`}
                    >
                      {field.title}
                    </span>

                    {field.isOptional && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200/60 text-gray-600 font-medium">
                        ?
                      </span>
                    )}

                    {field.isBranded && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200/60 text-amber-800 font-medium">
                        FK
                      </span>
                    )}
                  </div>

                  <span
                    className={`text-xs px-2 py-0.5 rounded-md font-medium border ${typeColor.bg} ${typeColor.text} ${typeColor.border} opacity-80`}
                  >
                    {field.type}
                  </span>
                </div>

                {field.description && (
                  <div className="text-xs text-gray-500 mt-1 opacity-70">
                    {field.description}
                  </div>
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
