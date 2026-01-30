import type { StdDescriptor, IndexEntry } from "../types";
import { useStudioStore } from "../store";
import { extractKeys } from "../utils";
import { IndexTable } from "./index-table";
import { SchemaTable } from "./schema-table";

interface EntityCardProps {
  descriptor: StdDescriptor;
  onEntityClick?: ((entityName: string) => void) | undefined;
}

function getIdField(descriptor: StdDescriptor): string | null {
  const skKeys = extractKeys(descriptor.primaryIndex.sk.pattern);
  return skKeys[0] ?? null;
}

export function EntityCard({ descriptor, onEntityClick }: EntityCardProps) {
  const { highlightedFields, setActiveEntity, setHighlightedField } = useStudioStore();

  const highlightedField = highlightedFields[descriptor.name] ?? null;
  const idField = getIdField(descriptor);

  const indexEntries: IndexEntry[] = [
    { label: "PRIMARY", index: descriptor.primaryIndex },
    ...(descriptor.timelineIndex
      ? [{ label: "TIMELINE", index: descriptor.timelineIndex }]
      : []),
    ...descriptor.secondaryIndexes.map((index) => ({
      label: index.name.toUpperCase(),
      index,
    })),
  ];

  return (
    <div
      id={`entity-${descriptor.name}`}
      className="bg-neutral-900 border border-neutral-700 rounded-lg p-4 w-64"
      onMouseEnter={() => setActiveEntity(descriptor.name)}
      onMouseLeave={() => setActiveEntity(null)}
    >
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-bold text-white">{descriptor.name}</h2>
        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full font-mono">
          {descriptor.version}
        </span>
      </div>

      <IndexTable
        entries={indexEntries}
        onKeyHover={(key) => setHighlightedField(descriptor.name, key)}
      />
      <SchemaTable
        schema={descriptor.schema}
        entityName={descriptor.name}
        idField={idField}
        highlightedField={highlightedField}
        onEntityClick={onEntityClick}
      />
    </div>
  );
}
