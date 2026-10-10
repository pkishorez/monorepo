/*
 * How the packages depend on each other, as nodes on a circle. Node size is
 * the package's downloads; a dependency is a solid arrow, a peer dependency
 * a dashed one, so the kind never rests on color alone.
 */

type Package = {
  readonly id: string;
  readonly npmName: string;
  readonly totalDownloads: number;
};
type Edge = {
  readonly source: string;
  readonly target: string;
  readonly kind: 'Dependency' | 'PeerDependency';
};

const SIZE = 360;
const CENTER = SIZE / 2;
const RING = 120;

export const Graph = ({
  packages,
  edges,
  highlightedId,
  selectedId,
  onPick,
}: {
  readonly packages: ReadonlyArray<Package>;
  readonly edges: ReadonlyArray<Edge>;
  /** The package chosen in the controls. */
  readonly highlightedId: string;
  /** The picked datum, if it is a package. */
  readonly selectedId: string | null;
  readonly onPick: (id: string) => void;
}) => {
  const most = Math.max(1, ...packages.map((p) => p.totalDownloads));
  const at = new Map(
    packages.map((p, i) => {
      // On the diagonals, so no arrow runs through a label below a node.
      const angle = (i / packages.length) * 2 * Math.PI - Math.PI / 4;
      const r = 14 + 22 * Math.sqrt(p.totalDownloads / most);
      return [
        p.id,
        {
          x: CENTER + RING * Math.cos(angle),
          y: CENTER + RING * Math.sin(angle),
          r,
        },
      ] as const;
    }),
  );

  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-sm font-medium">
        Package relationships from npm metadata
      </figcaption>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto w-full max-w-md"
        role="img"
        aria-label="Package dependency graph"
      >
        <defs>
          <marker
            id="charting-arrow"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="fill-muted-foreground" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const from = at.get(edge.source);
          const to = at.get(edge.target);
          if (!from || !to) return null;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const length = Math.hypot(dx, dy) || 1;
          return (
            <line
              key={`${edge.source}-${edge.target}-${edge.kind}`}
              x1={from.x + (dx / length) * from.r}
              y1={from.y + (dy / length) * from.r}
              x2={to.x - (dx / length) * (to.r + 2)}
              y2={to.y - (dy / length) * (to.r + 2)}
              className="stroke-muted-foreground"
              strokeWidth={2}
              strokeDasharray={
                edge.kind === 'PeerDependency' ? '5 4' : undefined
              }
              markerEnd="url(#charting-arrow)"
            >
              <title>{`${edge.source} → ${edge.target} (${edge.kind})`}</title>
            </line>
          );
        })}
        {packages.map((p) => {
          const { x, y, r } = at.get(p.id)!;
          const highlighted = p.id === highlightedId;
          const selected = selectedId === `Ecosystem:Package:${p.id}`;
          return (
            <g
              key={p.id}
              className="cursor-pointer"
              onClick={() => onPick(p.id)}
            >
              <title>{`${p.npmName}: ${p.totalDownloads.toLocaleString()} downloads this year`}</title>
              <circle
                cx={x}
                cy={y}
                r={r}
                className={`${highlighted ? 'fill-primary' : 'fill-muted'} ${selected ? 'stroke-foreground' : 'stroke-border'}`}
                strokeWidth={selected ? 3 : 2}
              />
              <text
                x={x}
                y={y + r + 14}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-medium"
              >
                {p.npmName}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-center text-xs text-muted-foreground">
        Solid: dependency. Dashed: peer dependency.
      </p>
    </figure>
  );
};
