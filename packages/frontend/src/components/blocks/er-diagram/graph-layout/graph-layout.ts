import { MarkerType, Position } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';

import type { presentSnapshot } from '../relationship-presentation';
import { entityHeight, entityWidth, toElkGraph } from './elk-model';

type Presentation = ReturnType<typeof presentSnapshot>;
type PresentedEntity = Presentation['entities'][number];
type Elk = InstanceType<(typeof import('elkjs/lib/elk.bundled.js'))['default']>;

interface EntityNodeData extends Record<string, unknown> {
  readonly entity: PresentedEntity;
  readonly focused: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly selectedField?: string;
  readonly connectedFields: readonly string[];
  readonly selfReferenced: boolean;
}

interface RelationshipEdgeData extends Record<string, unknown> {
  readonly relationship: Presentation['relationships'][number];
}

type EntityGraphNode = Node<EntityNodeData, 'entity'>;
type RelationshipGraphEdge = Edge<RelationshipEdgeData>;

let elkInstance: Promise<Elk> | undefined;

function getElk(): Promise<Elk> {
  elkInstance ??= import('elkjs/lib/elk.bundled.js').then(
    (module) => new module.default(),
  );
  return elkInstance;
}

function targetHandle(
  relationship: Presentation['relationships'][number],
): string {
  if (relationship.targetField === null) return 'external';
  return relationship.source === relationship.target
    ? `self:id:${relationship.targetField}`
    : `id:${relationship.targetField}`;
}

export async function layoutGraph(presentation: Presentation) {
  const elk = await getElk();
  const graph = await elk.layout(toElkGraph(presentation));
  const positions = new Map(
    (graph.children ?? []).map((node) => [
      node.id,
      { x: node.x ?? 0, y: node.y ?? 0 },
    ]),
  );
  const nodes: EntityGraphNode[] = presentation.entities.map((entity) => ({
    id: entity.id,
    type: 'entity',
    position: positions.get(entity.id) ?? { x: 0, y: 0 },
    width: entityWidth,
    height: entityHeight(entity),
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      entity,
      focused: false,
      related: false,
      dimmed: false,
      connectedFields: [],
      selfReferenced: presentation.relationships.some(
        (relationship) =>
          relationship.source === entity.id &&
          relationship.target === entity.id,
      ),
    },
    draggable: true,
    selectable: false,
    focusable: true,
  }));
  const edges: RelationshipGraphEdge[] = presentation.relationships.map(
    (relationship) => ({
      id: relationship.id,
      source: relationship.source,
      sourceHandle: `ref:${relationship.sourceField}`,
      target: relationship.target,
      targetHandle: targetHandle(relationship),
      type: 'smoothstep',
      pathOptions: {
        borderRadius: 12,
        offset: relationship.source === relationship.target ? 14 : 28,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 15,
        height: 15,
        color: 'var(--muted-foreground)',
      },
      style: {
        stroke: 'var(--muted-foreground)',
        strokeWidth: 1.35,
        opacity: 0.64,
      },
      data: { relationship },
      selectable: true,
      focusable: true,
    }),
  );

  return { id: presentation.id, nodes, edges } as const;
}
