/*
 * One series over the weeks, as a line or as bars, in plain SVG. Each week
 * has a hit area wider than its mark, a native tooltip, and can be picked.
 */

export type Datum = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
};

const W = 640;
const H = 220;
const PAD = { left: 48, right: 12, top: 12, bottom: 28 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

const niceMax = (max: number) => {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
};

const compact = new Intl.NumberFormat('en', { notation: 'compact' });

export const Plot = ({
  kind,
  title,
  unit,
  data,
  selectedId,
  onPick,
}: {
  readonly kind: 'line' | 'bar';
  readonly title: string;
  readonly unit: string;
  readonly data: ReadonlyArray<Datum>;
  readonly selectedId: string | null;
  readonly onPick: (id: string) => void;
}) => {
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const slot = INNER_W / Math.max(1, data.length);
  const x = (i: number) => PAD.left + slot * (i + 0.5);
  const y = (value: number) => PAD.top + INNER_H * (1 - value / max);
  const every = Math.ceil(data.length / 8);
  const line = data.map(
    (d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.value)}`,
  );

  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full text-primary"
        role="img"
        aria-label={title}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(max * f)}
              y2={y(max * f)}
              className="stroke-border"
            />
            <text
              x={PAD.left - 6}
              y={y(max * f)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {compact.format(max * f)}
            </text>
          </g>
        ))}
        {kind === 'line' && (
          <path
            d={line.join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        {data.map((d, i) => {
          const selected = d.id === selectedId;
          return (
            <g
              key={d.id}
              className="cursor-pointer"
              onClick={() => onPick(d.id)}
            >
              <title>{`${d.label}: ${d.value.toLocaleString()} ${unit}`}</title>
              <rect
                x={x(i) - slot / 2}
                y={PAD.top}
                width={slot}
                height={INNER_H}
                className={selected ? 'fill-muted' : 'fill-transparent'}
              />
              {kind === 'bar' ? (
                <rect
                  x={x(i) - Math.max(1, slot * 0.35)}
                  y={y(d.value)}
                  width={Math.max(2, slot * 0.7)}
                  height={Math.max(0, INNER_H - (y(d.value) - PAD.top))}
                  rx={2}
                  fill="currentColor"
                  opacity={selectedId === null || selected ? 1 : 0.55}
                />
              ) : (
                <circle
                  cx={x(i)}
                  cy={y(d.value)}
                  r={selected ? 5 : data.length > 20 ? 0 : 4}
                  fill="currentColor"
                  className="stroke-background"
                  strokeWidth={2}
                />
              )}
              {i % every === 0 && (
                <text
                  x={x(i)}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {d.label.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
};
