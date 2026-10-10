import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import type { Shot } from './camera.ts';
import { ease, fps, glide } from './time.ts';

// The one board every Explainer is drawn on. World coordinates have their
// origin at the centre of the 1920×1080 frame; the camera looks at `shot`.
export function Canvas({
  shot,
  children,
}: {
  shot: Shot;
  children: ReactNode;
}) {
  return (
    <AbsoluteFill className="overflow-hidden bg-background">
      <div
        className="absolute top-0 left-0"
        style={{
          transformOrigin: '0 0',
          transform: `translate(960px, 540px) scale(${shot.scale}) translate(${-shot.x}px, ${-shot.y}px)`,
        }}
      >
        <div
          className="absolute"
          style={{
            left: -4000,
            top: -3000,
            width: 12000,
            height: 8000,
            backgroundImage:
              'radial-gradient(circle, var(--border) 1.6px, transparent 1.6px)',
            backgroundSize: '32px 32px',
          }}
        />
        {children}
      </div>
    </AbsoluteFill>
  );
}

// Places a child centred on a world point.
export function At({
  x,
  y,
  children,
  style,
}: {
  x: number;
  y: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className="absolute"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)', ...style }}
    >
      {children}
    </div>
  );
}

// A region's title, written on the board above what it labels.
export function Region({
  x,
  y,
  title,
  frame,
  enter,
  opacity = 1,
  children,
}: {
  x: number;
  y: number;
  title: string;
  frame: number;
  enter: number;
  opacity?: number;
  children?: ReactNode;
}) {
  return (
    <At
      x={x}
      y={y}
      style={{ opacity: ease(frame, enter + 0.2 * fps) * opacity }}
    >
      <div className="flex items-center gap-4 text-[64px] leading-none font-semibold tracking-tight whitespace-nowrap">
        {title}
        {children}
      </div>
    </At>
  );
}

// The calm scene change for a genuinely new idea: the board fades to its own
// background around frame `at`, the camera jumps while hidden, and it fades
// back in. Draw it above the Canvas.
export function FadeThrough({ frame, at }: { frame: number; at: number }) {
  const opacity =
    ease(frame, at - 0.4 * fps, 0.4, glide) *
    (1 - ease(frame, at + 0.05 * fps, 0.5));
  return <AbsoluteFill className="bg-background" style={{ opacity }} />;
}

// kui components are sized for interfaces; zoom scales them up crisply.
export function Zoom({
  by,
  children,
  className,
  style,
}: {
  by: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={{ zoom: by, ...style }}>
      {children}
    </div>
  );
}
