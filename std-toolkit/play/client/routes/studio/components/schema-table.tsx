import type { ESchemaDescriptor, SchemaProperty } from "../types";
import { useStudioStore } from "../store";
import { getTypeDisplay, scrollbarStyles } from "../utils";
import { EntityReference } from "./entity-reference";
import { EntityIdentifier } from "./entity-identifier";

interface SchemaTableProps {
  schema: ESchemaDescriptor;
  entityName: string;
  idField: string | null;
  highlightedField: string | null;
  onEntityClick?: ((entityName: string) => void) | undefined;
}

export function SchemaTable({
  schema,
  entityName,
  idField,
  highlightedField,
  onEntityClick,
}: SchemaTableProps) {
  const { activeEntity, setActiveEntity } = useStudioStore();
  const properties = (schema.properties || {}) as Record<string, SchemaProperty>;
  const required = new Set(schema.required || []);

  const isEntityActive = activeEntity === entityName;

  const sortedEntries = Object.entries(properties).sort(([fieldA, propA], [fieldB, propB]) => {
    const isIdA = fieldA === idField;
    const isIdB = fieldB === idField;
    const isRefA = !!propA.identifier;
    const isRefB = !!propB.identifier;

    if (isIdA && !isIdB) return -1;
    if (!isIdA && isIdB) return 1;
    if (isRefA && !isRefB) return -1;
    if (!isRefA && isRefB) return 1;
    return 0;
  });

  return (
    <div className={`border border-neutral-700 rounded overflow-x-auto ${scrollbarStyles}`}>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-neutral-800 border-b border-neutral-700">
            <th className="text-left px-3 py-1.5 text-neutral-400 font-medium whitespace-nowrap">
              Field
            </th>
            <th className="text-left px-3 py-1.5 text-neutral-400 font-medium whitespace-nowrap">
              Type
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map(([field, prop]) => {
            const { type, color, title } = getTypeDisplay(prop);
            const isOptional = !required.has(field);
            const isHighlighted = highlightedField === field;
            const isReference = !!prop.identifier;
            const isIdField = field === idField;
            const isIdHighlighted = isEntityActive && isIdField;
            const isReferenceHighlighted = prop.identifier === activeEntity;
            const isPinkHighlighted = isIdHighlighted || isReferenceHighlighted;

            const rowClass = isPinkHighlighted
              ? "bg-pink-500/20"
              : isHighlighted
                ? "bg-blue-500/20"
                : "hover:bg-neutral-800/50";

            const hoverEntity = isReference ? prop.identifier : isIdField ? entityName : null;

            return (
              <tr
                key={field}
                className={`border-b border-neutral-800 last:border-b-0 transition-colors ${rowClass} ${
                  hoverEntity ? "cursor-pointer" : ""
                }`}
                onMouseEnter={() => hoverEntity && setActiveEntity(hoverEntity)}
                onMouseLeave={() => hoverEntity && setActiveEntity(null)}
                onClick={() => hoverEntity && onEntityClick?.(hoverEntity)}
              >
                <td className="px-3 py-1 font-mono whitespace-nowrap">
                  <span className="inline-block w-3 text-neutral-500">
                    {isOptional ? "?" : ""}
                  </span>
                  <span
                    className={
                      isPinkHighlighted
                        ? "text-pink-400"
                        : isOptional
                          ? "text-neutral-400"
                          : "text-white"
                    }
                  >
                    {field}
                  </span>
                </td>
                <td className="px-3 py-1 font-mono whitespace-nowrap">
                  {isReference ? (
                    <EntityReference
                      entityName={type}
                      isHighlighted={isReferenceHighlighted}
                    />
                  ) : isIdField ? (
                    <EntityIdentifier
                      entityName={entityName}
                      isHighlighted={isIdHighlighted}
                    />
                  ) : (
                    <span className={isPinkHighlighted ? "text-pink-400" : color} title={title}>
                      {type}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
