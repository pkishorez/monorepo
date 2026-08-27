import { MarkerType } from '@xyflow/react';

import type { layoutGraph } from '../graph-layout';

type Layout = Awaited<ReturnType<typeof layoutGraph>>;
type FocusTarget =
  | { readonly kind: 'entity'; readonly entityId: string }
  | {
      readonly kind: 'field';
      readonly entityId: string;
      readonly fieldName: string;
    };

export function applyRelationshipFocus(
  focus: FocusTarget | undefined,
  nodes: Layout['nodes'],
  edges: Layout['edges'],
  hover?: FocusTarget,
) {
  if (focus === undefined) {
    return {
      nodes: nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          focused: false,
          related: false,
          dimmed: false,
          selectedField: undefined,
          connectedFields: [],
        },
      })),
      edges,
    };
  }

  const selectedEdges = edges.filter((edge) =>
    focus.kind === 'entity'
      ? edge.source === focus.entityId || edge.target === focus.entityId
      : (edge.source === focus.entityId &&
          edge.data?.relationship.sourceField === focus.fieldName) ||
        (edge.target === focus.entityId &&
          edge.data?.relationship.targetField === focus.fieldName),
  );
  const hoveredCardEdges =
    focus.kind === 'entity' &&
    hover !== undefined &&
    hover.entityId !== focus.entityId
      ? selectedEdges.filter(
          (edge) =>
            (edge.source === focus.entityId &&
              edge.target === hover.entityId) ||
            (edge.target === focus.entityId && edge.source === hover.entityId),
        )
      : [];
  const hoveredFieldEdges =
    hover?.kind === 'field'
      ? hoveredCardEdges.filter(
          (edge) =>
            (edge.source === hover.entityId &&
              edge.data?.relationship.sourceField === hover.fieldName) ||
            (edge.target === hover.entityId &&
              edge.data?.relationship.targetField === hover.fieldName),
        )
      : [];
  const refiningField = hoveredFieldEdges.length > 0;
  const focusedEdges = refiningField
    ? hoveredFieldEdges
    : hoveredCardEdges.length > 0
      ? hoveredCardEdges
      : selectedEdges;
  const connectedNodeIds = new Set([focus.entityId]);
  focusedEdges.forEach((edge) => connectedNodeIds.add(edge.target));
  focusedEdges.forEach((edge) => connectedNodeIds.add(edge.source));
  const focusedEdgeIds = new Set(focusedEdges.map(({ id }) => id));
  const connectedFields = new Map<string, Set<string>>();
  if (focus.kind === 'field' || refiningField) {
    for (const edge of focusedEdges) {
      const relationship = edge.data?.relationship;
      if (relationship === undefined) continue;
      const sourceFields = connectedFields.get(edge.source) ?? new Set();
      sourceFields.add(relationship.sourceField);
      connectedFields.set(edge.source, sourceFields);
      if (relationship.targetField !== null) {
        const targetFields = connectedFields.get(edge.target) ?? new Set();
        targetFields.add(relationship.targetField);
        connectedFields.set(edge.target, targetFields);
      }
    }
  }

  return {
    nodes: nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        focused: node.id === focus.entityId,
        related: node.id !== focus.entityId && connectedNodeIds.has(node.id),
        dimmed: !connectedNodeIds.has(node.id),
        selectedField:
          focus.kind === 'field' && node.id === focus.entityId
            ? focus.fieldName
            : undefined,
        connectedFields: [...(connectedFields.get(node.id) ?? [])],
      },
    })),
    edges: edges.map((edge) => {
      const connected = focusedEdgeIds.has(edge.id);
      return {
        ...edge,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color: connected ? 'var(--primary)' : 'var(--muted-foreground)',
        },
        style: {
          stroke: connected ? 'var(--primary)' : 'var(--muted-foreground)',
          strokeWidth: connected ? 2 : 1.2,
          opacity: connected ? 0.96 : 0.1,
        },
        animated: false,
      };
    }),
  };
}
