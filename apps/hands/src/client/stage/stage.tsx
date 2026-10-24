import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { latest, subscribe } from '../tracker/index.ts';
import { draw } from './draw.ts';
import { Scene } from './scene.ts';

/*
 * The stage: a canvas the size of the camera image, drawn on every frame
 * the Tracker reads, straight from its snapshot. React draws only the box
 * and whatever is laid over it while the camera is off.
 */

export function Stage({
  skeleton,
  children,
}: {
  /** Whether to draw each hand's bones and points. */
  readonly skeleton: boolean;
  /** Laid over the stage: what to do while the camera is off. */
  readonly children?: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const showSkeleton = useRef(skeleton);
  showSkeleton.current = skeleton;
  const [aspect, setAspect] = useState(16 / 9);

  useEffect(() => {
    const scene = new Scene();
    return subscribe(() => {
      const element = canvas.current;
      const ctx = element?.getContext('2d');
      const snapshot = latest();
      if (!element || !ctx) return;
      if (snapshot === null) {
        ctx.clearRect(0, 0, element.width, element.height);
        return;
      }
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(element.clientWidth * ratio);
      const height = Math.round(element.clientHeight * ratio);
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }
      setAspect(snapshot.reading.aspect);
      scene.apply(snapshot.reading, snapshot.fired);
      draw(ctx, snapshot, scene, showSkeleton.current);
    });
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-border bg-muted"
      style={{ aspectRatio: aspect }}
    >
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {children}
    </div>
  );
}
