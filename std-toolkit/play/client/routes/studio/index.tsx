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

function IndexCard({ index, label }: { index: IndexDescriptor; label: string }) {
  return (
    <div className="bg-neutral-800/50 rounded-lg p-3">
      <div className="text-xs text-neutral-500 uppercase tracking-wide mb-2">
        {label}
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex gap-2">
          <span className="text-neutral-500">PK:</span>
          <code className="text-emerald-400">{index.pk.pattern}</code>
        </div>
        <div className="flex gap-2">
          <span className="text-neutral-500">SK:</span>
          <code className="text-amber-400">{index.sk.pattern}</code>
        </div>
      </div>
    </div>
  );
}

function getTypeDisplay(prop: any): { type: string; color: string } {
  if (prop.enum) {
    return { type: `enum(${prop.enum.join(" | ")})`, color: "text-purple-400" };
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

function SchemaTable({ schema }: { schema: ESchemaDescriptor }) {
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);

  return (
    <div className="border border-neutral-700 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-800 border-b border-neutral-700">
            <th className="text-left px-4 py-2 text-neutral-400 font-medium">
              Field
            </th>
            <th className="text-left px-4 py-2 text-neutral-400 font-medium">
              Type
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(properties).map(([field, prop]) => {
            const { type, color } = getTypeDisplay(prop);
            const isOptional = !required.has(field);
            return (
              <tr
                key={field}
                className="border-b border-neutral-800 hover:bg-neutral-800/50"
              >
                <td className="px-4 py-2 font-mono">
                  <span className="inline-block w-4 text-neutral-500">
                    {isOptional ? "?" : ""}
                  </span>
                  <span className={isOptional ? "text-neutral-400" : "text-white"}>
                    {field}
                  </span>
                </td>
                <td className={`px-4 py-2 font-mono ${color}`}>{type}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EntityCard({ descriptor }: { descriptor: StdDescriptor }) {
  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold text-white">{descriptor.name}</h2>
        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full font-mono">
          {descriptor.version}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <IndexCard index={descriptor.primaryIndex} label="Primary Index" />
        {descriptor.timelineIndex && (
          <IndexCard index={descriptor.timelineIndex} label="Timeline Index" />
        )}
        {descriptor.secondaryIndexes.map((index) => (
          <IndexCard
            key={index.name}
            index={index}
            label={`Secondary: ${index.name}`}
          />
        ))}
      </div>

      <div>
        <h3 className="text-sm text-neutral-400 uppercase tracking-wide mb-3">
          Schema Fields
        </h3>
        <SchemaTable schema={descriptor.schema} />
      </div>
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Studio</h1>
        <p className="text-neutral-400">Entity schema explorer</p>
      </div>

      {state ? (
        <div className="space-y-6">
          {state.descriptors.map((descriptor) => (
            <EntityCard key={descriptor.name} descriptor={descriptor} />
          ))}
        </div>
      ) : (
        <div className="text-neutral-500">Loading...</div>
      )}
    </div>
  );
}
