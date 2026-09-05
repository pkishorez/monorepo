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
  const entityAnchor = focus?.kind === 'entity' ? focus : undefined;
  const active = focus?.kind === 'field' ? focus : (hover ?? focus);
  if (active === undefined) {
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

  const primary = entityAnchor ?? active;
  const primaryEdges = edges.filter((edge) =>
    primary.kind === 'entity'
      ? edge.source === primary.entityId || edge.target === primary.entityId
      : (edge.source === primary.entityId &&
          edge.data?.relationship.sourceField === primary.fieldName) ||
        (edge.target === primary.entityId &&
          edge.data?.relationship.targetField === primary.fieldName),
  );
  const selectedEdges =
    entityAnchor === undefined || hover === undefined
      ? primaryEdges
      : hover.kind === 'entity'
        ? hover.entityId === entityAnchor.entityId
          ? primaryEdges
          : primaryEdges.filter(
              (edge) =>
                edge.source === hover.entityId ||
                edge.target === hover.entityId,
            )
        : primaryEdges.filter(
            (edge) =>
              (edge.source === hover.entityId &&
                edge.data?.relationship.sourceField === hover.fieldName) ||
              (edge.target === hover.entityId &&
                edge.data?.relationship.targetField === hover.fieldName),
          );
  const connectedNodeIds = new Set([primary.entityId]);
  selectedEdges.forEach((edge) => connectedNodeIds.add(edge.target));
  selectedEdges.forEach((edge) => connectedNodeIds.add(edge.source));
  const focusedEdgeIds = new Set(selectedEdges.map(({ id }) => id));
  const connectedFields = new Map<string, Set<string>>();
  const preciseField =
    primary.kind === 'field'
      ? primary
      : entityAnchor !== undefined && hover?.kind === 'field'
        ? hover
        : undefined;
  if (preciseField !== undefined) {
    for (const edge of selectedEdges) {
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
        focused: node.id === primary.entityId,
        related: node.id !== primary.entityId && connectedNodeIds.has(node.id),
        dimmed: !connectedNodeIds.has(node.id),
        selectedField:
          preciseField !== undefined &&
          preciseField.entityId === primary.entityId &&
          node.id === primary.entityId
            ? preciseField.fieldName
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
