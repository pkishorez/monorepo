const participantColumnWidth = 260;
const markerColumnWidth = 176;

type MutableParticipantNode = {
  readonly segment: string;
  readonly path: string;
  readonly children: MutableParticipantNode[];
  readonly childrenBySegment: Map<string, MutableParticipantNode>;
  participantName: string | null;
  participantCount: number;
};

export type ParticipantNode = Omit<
  MutableParticipantNode,
  'childrenBySegment' | 'children'
> & {
  readonly children: readonly ParticipantNode[];
};

export type ParticipantColumn =
  | {
      readonly kind: 'participant';
      readonly key: string;
      readonly path: string;
      readonly participantName: string;
      readonly width: number;
      readonly collapsedCount: number;
    }
  | {
      readonly kind: 'marker';
      readonly key: string;
      readonly path: string;
      readonly marker: 'collapsed' | 'hidden' | 'participant';
      readonly participantCount: number;
      readonly width: number;
    };

export type ParticipantHeaderCell = {
  readonly key: string;
  readonly kind: 'marker' | 'node' | 'self';
  readonly label: string;
  readonly path: string;
  readonly row: number;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly participantCount: number;
  readonly descendantCount: number;
  readonly collapsed: boolean;
  readonly marker?: 'collapsed' | 'hidden' | 'participant';
};

const participantSegments = (participantName: string) =>
  participantName.split('/');

const makeNode = (segment: string, path: string): MutableParticipantNode => ({
  segment,
  path,
  children: [],
  childrenBySegment: new Map(),
  participantName: null,
  participantCount: 0,
});

const countParticipants = (node: MutableParticipantNode): number => {
  const count =
    (node.participantName === null ? 0 : 1) +
    node.children.reduce((total, child) => total + countParticipants(child), 0);
  node.participantCount = count;
  return count;
};

const buildTree = (participantNames: readonly string[]) => {
  const roots: MutableParticipantNode[] = [];
  const rootsBySegment = new Map<string, MutableParticipantNode>();
  const nodesByPath = new Map<string, MutableParticipantNode>();

  for (const participantName of participantNames) {
    const segments = participantSegments(participantName);
    let parent: MutableParticipantNode | null = null;
    let path = '';

    for (const segment of segments) {
      path = path.length === 0 ? segment : `${path}/${segment}`;
      const siblings: Map<string, MutableParticipantNode> =
        parent?.childrenBySegment ?? rootsBySegment;
      let node: MutableParticipantNode | undefined = siblings.get(segment);
      if (node === undefined) {
        node = makeNode(segment, path);
        siblings.set(segment, node);
        (parent?.children ?? roots).push(node);
        nodesByPath.set(path, node);
      }
      parent = node;
    }

    if (parent !== null) parent.participantName = participantName;
  }

  for (const root of roots) countParticipants(root);
  return { nodesByPath, roots };
};

const visibleColumns = (
  roots: readonly MutableParticipantNode[],
  hiddenPaths: ReadonlySet<string>,
  hiddenParticipantNames: ReadonlySet<string>,
  collapsedPaths: ReadonlySet<string>,
) => {
  const columns: ParticipantColumn[] = [];

  const visit = (node: MutableParticipantNode) => {
    if (hiddenPaths.has(node.path)) {
      columns.push({
        kind: 'marker',
        key: `hidden:${node.path}`,
        marker: 'hidden',
        participantCount: node.participantCount,
        path: node.path,
        width: markerColumnWidth,
      });
      return;
    }

    const descendantCount =
      node.participantCount - (node.participantName === null ? 0 : 1);
    const collapsed = descendantCount > 0 && collapsedPaths.has(node.path);

    if (node.participantName !== null) {
      if (hiddenParticipantNames.has(node.participantName)) {
        columns.push({
          kind: 'marker',
          key: `participant:${node.participantName}`,
          marker: 'participant',
          participantCount: 1,
          path: node.path,
          width: markerColumnWidth,
        });
      } else {
        columns.push({
          kind: 'participant',
          key: `participant:${node.participantName}`,
          participantName: node.participantName,
          path: node.path,
          width: participantColumnWidth,
          collapsedCount: collapsed ? descendantCount : 0,
        });
      }
    }

    if (!collapsed) {
      for (const child of node.children) visit(child);
    } else if (node.participantName === null) {
      columns.push({
        kind: 'marker',
        key: `collapsed:${node.path}`,
        marker: 'collapsed',
        participantCount: node.participantCount,
        path: node.path,
        width: markerColumnWidth,
      });
    }
  };

  for (const root of roots) visit(root);
  return columns;
};

const headerCells = (
  columns: readonly ParticipantColumn[],
  nodesByPath: ReadonlyMap<string, MutableParticipantNode>,
  collapsedPaths: ReadonlySet<string>,
) => {
  const maxDepth = Math.max(
    1,
    ...columns.map((column) => {
      const node = nodesByPath.get(column.path)!;
      const selfRow =
        (column.kind === 'participant' || column.marker === 'participant') &&
        node.participantCount > 1
          ? 1
          : 0;
      return participantSegments(column.path).length + selfRow;
    }),
  );
  const cells: ParticipantHeaderCell[] = [];

  for (let row = 0; row < maxDepth; row += 1) {
    let open:
      | (Omit<ParticipantHeaderCell, 'endColumn'> & {
          endColumn: number;
        })
      | null = null;

    const close = () => {
      if (open !== null) cells.push(open);
      open = null;
    };

    columns.forEach((column, columnIndex) => {
      const segments = participantSegments(column.path);
      const node = nodesByPath.get(column.path)!;
      let cell: Omit<ParticipantHeaderCell, 'endColumn'> | null = null;

      if (row < segments.length) {
        const path = segments.slice(0, row + 1).join('/');
        const pathNode = nodesByPath.get(path)!;
        const finalSegment = row === segments.length - 1;
        const marker =
          column.kind === 'marker' &&
          finalSegment &&
          (column.marker !== 'participant' || node.participantCount === 1)
            ? column.marker
            : undefined;
        cell = {
          key: marker === undefined ? `node:${path}` : `${marker}:${path}`,
          kind: marker === undefined ? 'node' : 'marker',
          label: pathNode.segment,
          path,
          row,
          startColumn: columnIndex,
          participantCount: pathNode.participantCount,
          descendantCount:
            pathNode.participantCount -
            (pathNode.participantName === null ? 0 : 1),
          collapsed: collapsedPaths.has(path),
          ...(marker === undefined ? {} : { marker }),
        };
      } else if (
        row === segments.length &&
        (column.kind === 'participant' || column.marker === 'participant') &&
        node.participantCount > 1
      ) {
        const participantHidden =
          column.kind === 'marker' && column.marker === 'participant';
        cell = {
          key: participantHidden
            ? `participant:${column.path}`
            : `self:${column.path}`,
          kind: participantHidden ? 'marker' : 'self',
          label: 'own activity',
          path: column.path,
          row,
          startColumn: columnIndex,
          participantCount: 1,
          descendantCount: 0,
          collapsed: false,
          ...(participantHidden ? { marker: 'participant' as const } : {}),
        };
      }

      if (cell === null) {
        close();
        return;
      }
      if (open?.key === cell.key) {
        open.endColumn = columnIndex;
        return;
      }
      close();
      open = { ...cell, endColumn: columnIndex };
    });
    close();
  }

  return { cells, maxDepth };
};

export const makeParticipantHierarchy = (
  participantNames: readonly string[],
  options: {
    readonly hiddenPaths?: ReadonlySet<string>;
    readonly hiddenParticipantNames?: ReadonlySet<string>;
    readonly collapsedPaths?: ReadonlySet<string>;
  } = {},
) => {
  const hiddenPaths = options.hiddenPaths ?? new Set<string>();
  const hiddenParticipantNames =
    options.hiddenParticipantNames ?? new Set<string>();
  const collapsedPaths = options.collapsedPaths ?? new Set<string>();
  const tree = buildTree(participantNames);
  const columns = visibleColumns(
    tree.roots,
    hiddenPaths,
    hiddenParticipantNames,
    collapsedPaths,
  );
  const header = headerCells(columns, tree.nodesByPath, collapsedPaths);

  return {
    columns,
    headerCells: header.cells,
    maxDepth: header.maxDepth,
    nodesByPath: tree.nodesByPath as ReadonlyMap<string, ParticipantNode>,
    roots: tree.roots as readonly ParticipantNode[],
    visibleParticipants: new Set(
      columns.flatMap((column) =>
        column.kind === 'participant' ? [column.participantName] : [],
      ),
    ),
  };
};

export type ParticipantHierarchy = ReturnType<typeof makeParticipantHierarchy>;
