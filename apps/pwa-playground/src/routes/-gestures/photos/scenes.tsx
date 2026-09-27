/**
 * The "photos": landscapes drawn in SVG from kui's chart tokens, so the lab
 * needs no image files or network. Each is 3:4, and scales to fit its box.
 */

const token = (name: string, alpha = 1) =>
  alpha === 1
    ? `var(--${name})`
    : `color-mix(in oklch, var(--${name}) ${alpha * 100}%, transparent)`;

type Scene = { readonly title: string; readonly body: React.ReactNode };

const sky = (id: string, top: string, bottom: string) => (
  <>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: top }} />
        <stop offset="1" style={{ stopColor: bottom }} />
      </linearGradient>
    </defs>
    <rect width="300" height="400" fill={`url(#${id})`} />
  </>
);

export const SCENES: ReadonlyArray<Scene> = [
  {
    title: 'Dusk over the hills',
    body: (
      <>
        {sky('dusk', token('chart-6'), token('chart-9', 0.8))}
        <circle cx="200" cy="210" r="46" fill={token('chart-7')} />
        <path
          d="M0 260 Q80 200 160 250 T300 230 V400 H0Z"
          fill={token('chart-8', 0.85)}
        />
        <path
          d="M0 310 Q110 250 210 300 T300 290 V400 H0Z"
          fill={token('chart-5')}
        />
      </>
    ),
  },
  {
    title: 'Morning at sea',
    body: (
      <>
        {sky('sea', token('chart-8', 0.35), token('chart-7', 0.5))}
        <circle cx="90" cy="190" r="34" fill={token('chart-7')} />
        <rect y="240" width="300" height="160" fill={token('chart-6', 0.8)} />
        {[260, 285, 315, 350].map((y, index) => (
          <path
            key={y}
            d={`M${20 + index * 30} ${y} h${120 - index * 10}`}
            stroke={token('chart-1', 0.6)}
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}
      </>
    ),
  },
  {
    title: 'Fields in spring',
    body: (
      <>
        {sky('spring', token('chart-8', 0.5), token('chart-1'))}
        <path
          d="M0 220 Q150 170 300 220 V400 H0Z"
          fill={token('positive', 0.6)}
        />
        <path
          d="M0 280 Q150 230 300 300 V400 H0Z"
          fill={token('positive', 0.9)}
        />
        {[
          [60, 330],
          [120, 350],
          [200, 340],
          [250, 365],
          [90, 375],
        ].map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="6"
            fill={token('chart-7')}
          />
        ))}
      </>
    ),
  },
  {
    title: 'A clear night',
    body: (
      <>
        {sky('night', token('chart-5'), token('chart-6', 0.7))}
        <circle cx="210" cy="90" r="30" fill={token('chart-1')} />
        <circle cx="222" cy="82" r="28" fill={token('chart-5')} />
        {[
          [40, 60],
          [80, 130],
          [130, 50],
          [170, 160],
          [260, 150],
          [30, 200],
          [110, 220],
          [240, 230],
        ].map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="2"
            fill={token('chart-1')}
          />
        ))}
        <path
          d="M0 300 L70 230 L120 280 L190 200 L300 310 V400 H0Z"
          fill={token('chart-4')}
        />
      </>
    ),
  },
  {
    title: 'Dunes at noon',
    body: (
      <>
        {sky('dunes', token('chart-7', 0.35), token('chart-1'))}
        <circle cx="150" cy="120" r="40" fill={token('chart-7', 0.9)} />
        <path
          d="M0 250 Q90 200 180 260 T300 250 V400 H0Z"
          fill={token('chart-7', 0.7)}
        />
        <path
          d="M0 320 Q120 270 220 330 T300 320 V400 H0Z"
          fill={token('chart-7')}
        />
      </>
    ),
  },
];

/** One scene, fitted into its box. */
export function Photo(props: { readonly index: number }) {
  const scene = SCENES[props.index];
  if (scene === undefined) return null;
  return (
    <svg
      role="img"
      aria-label={scene.title}
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid meet"
      className="size-full"
    >
      {scene.body}
    </svg>
  );
}
