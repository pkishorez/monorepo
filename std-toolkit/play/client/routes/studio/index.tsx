import { Effect } from "effect";
import { useComponentLifecycle } from "use-effect-ts";
import { RealtimeClient, runtime } from "../../services";
import { useState } from "react";
import type { StdDescriptor, IndexDescriptor } from "@std-toolkit/core";
import type { ESchemaDescriptor } from "@std-toolkit/eschema";

interface DescriptorResponse {
  operation: "descriptor";
  timing: {
    startedAt: number;
    completedAt: number;
    durationMs: number;
  };
  descriptors: StdDescriptor[];
}

function hasVariable(pattern: string) {
  return pattern.includes("{");
}

interface IndexEntry {
  label: string;
  index: IndexDescriptor;
}

const scrollbarStyles = `
  [&::-webkit-scrollbar]:h-1.5
  [&::-webkit-scrollbar-track]:bg-neutral-800
  [&::-webkit-scrollbar-track]:rounded
  [&::-webkit-scrollbar-thumb]:bg-neutral-600
  [&::-webkit-scrollbar-thumb]:rounded
  [&::-webkit-scrollbar-thumb:hover]:bg-neutral-500
`;

function extractKeys(pattern: string): string[] {
  const matches = pattern.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

interface KeyBadgeProps {
  name: string;
  variant: "pk" | "sk";
  onHover: (key: string | null) => void;
}

function KeyBadge({ name, variant, onHover }: KeyBadgeProps) {
  const colors =
    variant === "pk"
      ? "bg-emerald-500/15 text-emerald-400"
      : "bg-amber-500/15 text-amber-400";
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${colors}`}
      onMouseEnter={() => onHover(name)}
      onMouseLeave={() => onHover(null)}
    >
      {name}
    </span>
  );
}

interface IndexTableProps {
  entries: IndexEntry[];
  onKeyHover: (key: string | null) => void;
}

function IndexTable({ entries, onKeyHover }: IndexTableProps) {
  const filtered = entries.filter(
    ({ index }) => hasVariable(index.pk.pattern) || hasVariable(index.sk.pattern),
  );

  if (filtered.length === 0) return null;

  return (
    <div className="text-xs mb-4">
      <div className="text-neutral-500 uppercase tracking-wide text-[10px] mb-1.5">
        Indexes
      </div>
      <div className={`overflow-x-auto pb-1 ${scrollbarStyles}`}>
        <div className="space-y-1">
          {filtered.map(({ label, index }) => {
            const pkKeys = extractKeys(index.pk.pattern);
            const skKeys = extractKeys(index.sk.pattern);
            return (
              <div key={label} className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-neutral-500 text-[10px] w-16 shrink-0">{label}</span>
                <div className="flex items-center gap-1">
                  {pkKeys.map((key) => (
                    <KeyBadge key={`pk-${key}`} name={key} variant="pk" onHover={onKeyHover} />
                  ))}
                  {pkKeys.length > 0 && skKeys.length > 0 && (
                    <span className="text-neutral-600 text-[10px]">→</span>
                  )}
                  {skKeys.map((key) => (
                    <KeyBadge key={`sk-${key}`} name={key} variant="sk" onHover={onKeyHover} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TypeDisplay {
  type: string;
  color: string;
  title?: string;
}

function getTypeDisplay(prop: any): TypeDisplay {
  if (prop.enum) {
    if (prop.enum.length === 1) {
      return { type: `"${prop.enum[0]}"`, color: "text-purple-400" };
    }
    return {
      type: `enum(${prop.enum.length})`,
      color: "text-purple-400",
      title: prop.enum.join(" | "),
    };
  }
  if (prop.type === "string") {
    return { type: "string", color: "text-emerald-400" };
  }
  if (prop.type === "number" || prop.type === "integer") {
    return { type: prop.type, color: "text-blue-400" };
  }
  if (prop.type === "boolean") {
    return { type: "boolean", color: "text-amber-400" };
  }
  if (prop.type === "array") {
    return { type: "array", color: "text-cyan-400" };
  }
  if (prop.type === "object") {
    return { type: "object", color: "text-orange-400" };
  }
  return { type: prop.type || "unknown", color: "text-neutral-400" };
}

interface SchemaTableProps {
  schema: ESchemaDescriptor;
  highlightedField: string | null;
}

function SchemaTable({ schema, highlightedField }: SchemaTableProps) {
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);

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
          {Object.entries(properties).map(([field, prop]) => {
            const { type, color, title } = getTypeDisplay(prop);
            const isOptional = !required.has(field);
            const isHighlighted = highlightedField === field;
            return (
              <tr
                key={field}
                className={`border-b border-neutral-800 last:border-b-0 transition-colors ${
                  isHighlighted ? "bg-blue-500/20" : "hover:bg-neutral-800/50"
                }`}
              >
                <td className="px-3 py-1 font-mono whitespace-nowrap">
                  <span className="inline-block w-3 text-neutral-500">
                    {isOptional ? "?" : ""}
                  </span>
                  <span className={isOptional ? "text-neutral-400" : "text-white"}>
                    {field}
                  </span>
                </td>
                <td className={`px-3 py-1 font-mono whitespace-nowrap ${color}`} title={title}>
                  {type}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EntityCard({ descriptor }: { descriptor: StdDescriptor }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

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
    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-4 w-64">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-bold text-white">{descriptor.name}</h2>
        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full font-mono">
          {descriptor.version}
        </span>
      </div>

      <IndexTable entries={indexEntries} onKeyHover={setHoveredKey} />
      <SchemaTable schema={descriptor.schema} highlightedField={hoveredKey} />
    </div>
  );
}

export function StudioRoute() {
  const [state, setState] = useState<DescriptorResponse | null>(null);

  useComponentLifecycle(
    Effect.gen(function* () {
      const realtime = yield* RealtimeClient;
      const result = yield* realtime.api["__std-toolkit__command"]({
        operation: "descriptor",
      });
      setState(result as DescriptorResponse);
    }).pipe(Effect.provide(runtime)),
  );

  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold mb-1">Studio</h1>
        <p className="text-neutral-400 text-sm">Entity schema explorer</p>
      </div>

      {state ? (
        <div className="flex flex-wrap justify-center gap-4">
          {state.descriptors.map((descriptor) => (
            <EntityCard key={descriptor.name} descriptor={descriptor} />
          ))}
        </div>
      ) : (
        <div className="text-neutral-500 text-center">Loading...</div>
      )}
    </div>
  );
}
