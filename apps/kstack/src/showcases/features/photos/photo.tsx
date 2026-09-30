import { memo, type ReactNode, useId } from 'react';
import { type Photo, random, type Scene } from './data.ts';

type Canvas = {
  readonly w: number;
  readonly h: number;
  readonly hue: number;
  readonly rand: () => number;
  /** A gradient id unique to this drawing. */
  readonly id: (name: string) => string;
};

const W = 400;

/**
 * A photo, drawn as an SVG scene from its seed. It fills its box and crops
 * like `object-fit: cover`, so a square tile shows its middle.
 */
export const PhotoArt = memo(function PhotoArt(props: {
  readonly photo: Photo;
}) {
  const { photo } = props;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const h = Math.round(W / photo.aspect);
  const canvas: Canvas = {
    w: W,
    h,
    hue: photo.hue,
    rand: random(photo.seed),
    id: (name) => `${uid}-${name}`,
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${h}`}
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
      aria-hidden="true"
    >
      {SCENES[photo.scene](canvas)}
    </svg>
  );
});

// A ridge line across the canvas, closed along the bottom. Smooth ones are
// hills and dunes; sharp ones are peaks.
const ridge = (
  c: Canvas,
  base: number,
  amp: number,
  points: number,
  smooth: boolean,
) => {
  const ys = Array.from({ length: points + 1 }, () => base - c.rand() * amp);
  const step = c.w / points;
  let d = `M0 ${c.h} L0 ${ys[0]}`;
  for (let i = 1; i <= points; i++) {
    const x = i * step;
    const y = ys[i] ?? base;
    if (smooth) {
      const px = x - step;
      const py = ys[i - 1] ?? base;
      d += ` C${px + step / 2} ${py} ${x - step / 2} ${y} ${x} ${y}`;
    } else {
      d += ` L${x} ${y}`;
    }
  }
  return `${d} L${c.w} ${c.h} Z`;
};

const sky = (c: Canvas, stops: ReadonlyArray<string>) => (
  <>
    <defs>
      <linearGradient id={c.id('sky')} x1="0" y1="0" x2="0" y2="1">
        {stops.map((color, i) => (
          <stop
            key={i}
            offset={i / Math.max(stops.length - 1, 1)}
            stopColor={color}
          />
        ))}
      </linearGradient>
    </defs>
    <rect width={c.w} height={c.h} fill={`url(#${c.id('sky')})`} />
  </>
);

const glow = (c: Canvas, x: number, y: number, r: number, color: string) => (
  <>
    <defs>
      <radialGradient id={c.id('glow')}>
        <stop offset="0" stopColor={color} stopOpacity="0.7" />
        <stop offset="1" stopColor={color} stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx={x} cy={y} r={r * 5} fill={`url(#${c.id('glow')})`} />
    <circle cx={x} cy={y} r={r} fill={color} />
  </>
);

const sunset = (c: Canvas) => {
  const horizon = c.h * (0.5 + c.rand() * 0.15);
  const warm = 15 + c.rand() * 25;
  return (
    <>
      {sky(c, [
        `hsl(${250 + c.rand() * 40} 45% 22%)`,
        `hsl(${330 + c.rand() * 20} 60% 55%)`,
        `hsl(${warm} 95% 65%)`,
      ])}
      {glow(
        c,
        c.w * (0.25 + c.rand() * 0.5),
        horizon - c.h * 0.04,
        c.w * 0.07,
        'hsl(45 100% 88%)',
      )}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={ridge(c, horizon + i * c.h * 0.12, c.h * 0.12, 6, i > 0)}
          fill={`hsl(${280 - i * 20} 30% ${28 - i * 9}%)`}
        />
      ))}
    </>
  );
};

const beach = (c: Canvas) => {
  const horizon = c.h * (0.38 + c.rand() * 0.12);
  const shore = c.h * (0.68 + c.rand() * 0.1);
  const sea = 185 + c.rand() * 20;
  return (
    <>
      {sky(c, [`hsl(205 70% 62%)`, `hsl(195 60% 86%)`])}
      <defs>
        <linearGradient id={c.id('sea')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${sea + 10} 65% 38%)`} />
          <stop offset="1" stopColor={`hsl(${sea - 10} 60% 55%)`} />
        </linearGradient>
      </defs>
      <rect
        y={horizon}
        width={c.w}
        height={c.h - horizon}
        fill={`url(#${c.id('sea')})`}
      />
      <path
        d={ridge(c, shore, c.h * 0.05, 4, true)}
        fill="hsl(40 60% 88%)"
        stroke="hsl(0 0% 100% / 0.8)"
        strokeWidth="4"
      />
      <path
        d={ridge(c, shore + c.h * 0.08, c.h * 0.04, 3, true)}
        fill="hsl(36 45% 76%)"
      />
    </>
  );
};

const mountains = (c: Canvas) => {
  const base = c.h * (0.5 + c.rand() * 0.1);
  return (
    <>
      {sky(c, [`hsl(210 45% 70%)`, `hsl(200 40% 92%)`])}
      <defs>
        <linearGradient id={c.id('snow')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(0 0% 100%)" />
          <stop offset="0.3" stopColor="hsl(215 20% 62%)" />
          <stop offset="1" stopColor="hsl(215 28% 30%)" />
        </linearGradient>
      </defs>
      <path d={ridge(c, base, c.h * 0.3, 5, false)} fill="hsl(215 25% 72%)" />
      <path
        d={ridge(c, base + c.h * 0.1, c.h * 0.32, 4, false)}
        fill={`url(#${c.id('snow')})`}
      />
      <path
        d={ridge(c, c.h * 0.86, c.h * 0.06, 5, true)}
        fill="hsl(150 20% 22%)"
      />
    </>
  );
};

const city = (c: Canvas) => {
  const buildings: Array<ReactNode> = [];
  for (let x = -10, i = 0; x < c.w; i++) {
    const bw = 24 + c.rand() * 36;
    const bh = c.h * (0.2 + c.rand() * 0.45);
    const top = c.h - bh;
    buildings.push(
      <rect
        key={`b${i}`}
        x={x}
        y={top}
        width={bw}
        height={bh}
        fill={`hsl(230 25% ${10 + c.rand() * 8}%)`}
      />,
    );
    for (let wy = top + 8; wy < c.h - 8; wy += 12) {
      for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
        if (c.rand() < 0.22) {
          buildings.push(
            <rect
              key={`w${i}-${wx}-${wy}`}
              x={wx}
              y={wy}
              width="4"
              height="6"
              fill="hsl(45 95% 72%)"
              opacity={0.5 + c.rand() * 0.5}
            />,
          );
        }
      }
    }
    x += bw + 2;
  }
  return (
    <>
      {sky(c, [
        `hsl(235 40% 16%)`,
        `hsl(${280 + c.rand() * 30} 35% 35%)`,
        `hsl(${15 + c.rand() * 15} 75% 60%)`,
      ])}
      {buildings}
    </>
  );
};

const night = (c: Canvas) => (
  <>
    {sky(c, [`hsl(235 55% 7%)`, `hsl(${240 + c.rand() * 30} 40% 24%)`])}
    {Array.from({ length: 60 }, (_, i) => (
      <circle
        key={i}
        cx={c.rand() * c.w}
        cy={c.rand() * c.h * 0.7}
        r={0.6 + c.rand() * 1.4}
        fill="white"
        opacity={0.3 + c.rand() * 0.7}
      />
    ))}
    {glow(
      c,
      c.w * (0.2 + c.rand() * 0.6),
      c.h * (0.15 + c.rand() * 0.2),
      c.w * 0.05,
      'hsl(50 40% 92%)',
    )}
    <path d={ridge(c, c.h * 0.8, c.h * 0.15, 6, true)} fill="hsl(240 30% 6%)" />
  </>
);

const forest = (c: Canvas) => {
  const front = c.h * 0.78;
  const trees = Array.from({ length: 14 }, (_, i) => {
    const x = c.rand() * c.w;
    const th = c.h * (0.12 + c.rand() * 0.14);
    const y = front + c.rand() * c.h * 0.05;
    return (
      <path
        key={i}
        d={`M${x} ${y - th} L${x + th * 0.28} ${y} L${x - th * 0.28} ${y} Z`}
        fill={`hsl(${140 + c.rand() * 20} 35% ${14 + c.rand() * 8}%)`}
      />
    );
  });
  return (
    <>
      {sky(c, [`hsl(190 35% 78%)`, `hsl(90 25% 88%)`])}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={ridge(c, c.h * (0.52 + i * 0.1), c.h * 0.12, 5, true)}
          fill={`hsl(${150 - i * 10} ${25 + i * 8}% ${62 - i * 14}%)`}
        />
      ))}
      {trees}
      <path
        d={ridge(c, c.h * 0.92, c.h * 0.04, 4, true)}
        fill="hsl(130 35% 18%)"
      />
    </>
  );
};

const desert = (c: Canvas) => (
  <>
    {sky(c, [`hsl(205 60% 62%)`, `hsl(35 70% 86%)`])}
    {glow(
      c,
      c.w * (0.15 + c.rand() * 0.7),
      c.h * (0.18 + c.rand() * 0.15),
      c.w * 0.05,
      'hsl(45 100% 92%)',
    )}
    {[0, 1, 2, 3].map((i) => (
      <path
        key={i}
        d={ridge(c, c.h * (0.55 + i * 0.12), c.h * 0.1, 3, true)}
        fill={`hsl(${30 - i * 4} ${60 + i * 5}% ${68 - i * 9}%)`}
      />
    ))}
  </>
);

const bloom = (c: Canvas) => {
  const cx = c.w * (0.35 + c.rand() * 0.3);
  const cy = c.h * (0.4 + c.rand() * 0.2);
  const petals = 7 + Math.floor(c.rand() * 6);
  const len = c.w * (0.22 + c.rand() * 0.1);
  return (
    <>
      <defs>
        <radialGradient id={c.id('bg')} cx="0.5" cy="0.45" r="0.8">
          <stop offset="0" stopColor={`hsl(${c.hue} 45% 32%)`} />
          <stop offset="1" stopColor={`hsl(${c.hue + 40} 40% 10%)`} />
        </radialGradient>
        <radialGradient id={c.id('petal')} cx="0.5" cy="0.9" r="0.9">
          <stop offset="0" stopColor={`hsl(${c.hue + 180} 90% 88%)`} />
          <stop offset="1" stopColor={`hsl(${c.hue + 200} 75% 58%)`} />
        </radialGradient>
      </defs>
      <rect width={c.w} height={c.h} fill={`url(#${c.id('bg')})`} />
      {Array.from({ length: petals }, (_, i) => (
        <ellipse
          key={i}
          cx={cx}
          cy={cy - len / 2}
          rx={len * 0.28}
          ry={len / 2}
          fill={`url(#${c.id('petal')})`}
          opacity="0.92"
          transform={`rotate(${(360 / petals) * i} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={len * 0.18} fill="hsl(45 95% 60%)" />
    </>
  );
};

const SCENES: Record<Scene, (c: Canvas) => ReactNode> = {
  sunset,
  beach,
  mountains,
  city,
  night,
  forest,
  desert,
  bloom,
};
