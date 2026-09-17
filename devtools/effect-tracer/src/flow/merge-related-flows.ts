import type { RecordedFlow } from './schema.js';

const merge = (
  root: RecordedFlow,
  flows: ReadonlyArray<RecordedFlow>,
): RecordedFlow => ({
  ...root,
  latestTimestamp: Math.max(
    ...flows.map(({ latestTimestamp }) => latestTimestamp),
  ),
  items: flows
    .flatMap(({ items }) => items)
    .sort((left, right) => left.timestamp - right.timestamp),
  activations: flows
    .flatMap(({ activations }) => activations)
    .sort((left, right) => left.startTimestamp - right.startTimestamp),
  warnings: flows.flatMap(({ warnings }) => warnings),
});

/** Combines each parent Flow and its descendants into one presentation Flow. */
export const mergeRelatedFlowRecords = (
  flows: ReadonlyArray<RecordedFlow>,
): ReadonlyArray<RecordedFlow> => {
  const ids = new Set(flows.map(({ id }) => id));
  const children = new Map<string, RecordedFlow[]>();
  for (const flow of flows) {
    if (flow.parentFlowId === undefined) continue;
    const siblings = children.get(flow.parentFlowId) ?? [];
    siblings.push(flow);
    children.set(flow.parentFlowId, siblings);
  }

  const remaining = new Set(flows);
  const collect = (flow: RecordedFlow, group: RecordedFlow[]) => {
    if (!remaining.delete(flow)) return;
    group.push(flow);
    for (const child of children.get(flow.id) ?? []) collect(child, group);
  };
  const output: RecordedFlow[] = [];
  const roots = flows.filter(
    ({ parentFlowId }) => parentFlowId === undefined || !ids.has(parentFlowId),
  );
  for (const root of [...roots, ...flows]) {
    if (!remaining.has(root)) continue;
    const group: RecordedFlow[] = [];
    collect(root, group);
    output.push(group.length === 1 ? root : merge(root, group));
  }
  return output;
};
