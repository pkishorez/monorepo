import {
  motion,
  type MotionValue,
  useReducedMotion,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import type { Controller } from './controller.ts';
import { DEPTH, pageAt, placeholderAt, SINK_SHADE } from './geometry.ts';
import { PendingPage } from './pending.tsx';

function Shade(props: { readonly opacity: MotionValue<number> }) {
  return (
    <motion.div
      aria-hidden="true"
      style={{ opacity: props.opacity }}
      className="pointer-events-none absolute inset-0 dark:bg-black"
    />
  );
}

/**
 * The Turn Surface: the page, named `page-turn` for route view transitions,
 * and the Placeholder Page beside it under a finger, which shows the target's
 * own loading screen, or `failed` when it could not load. Under reduced
 * motion the pages slide without sinking or rising.
 */
export function Surface(props: {
  readonly controller: Controller;
  readonly children: ReactNode;
  readonly className?: string;
  /** How a page sits in the surface, such as the padding around it. */
  readonly frame?: (page: ReactNode) => ReactNode;
  readonly failed?: (retry: () => void) => ReactNode;
}) {
  const { turn, load, progress, way, width, veil, landed, retry } =
    props.controller;
  const surface = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() === true;
  const depth = reduced ? 0 : DEPTH;
  const shade = reduced ? 0 : SINK_SHADE;

  useLayoutEffect(() => {
    const element = surface.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => width.set(element.clientWidth));
    observer.observe(element);
    width.set(element.clientWidth);
    return () => observer.disconnect();
  }, [width]);

  const side = () => (way.get() > 0 ? 'next' : 'prev');
  const page = () => pageAt(side(), progress.get(), depth);
  const incoming = () => placeholderAt(side(), progress.get(), depth);
  const pageX = useTransform(() => page().x * width.get());
  const pageScale = useTransform(() => page().scale);
  const placeholderX = useTransform(() => incoming().x * width.get());
  const placeholderScale = useTransform(() => incoming().scale);
  // The page further from you dims as it sinks: in the dark theme only, where
  // a shadow cannot show depth.
  const pageShade = useTransform(() =>
    side() === 'next' ? progress.get() * shade : 0,
  );
  const placeholderShade = useTransform(() =>
    side() === 'prev' ? (1 - progress.get()) * shade : 0,
  );

  const frame = props.frame ?? ((page: ReactNode) => page);
  const busy = turn.phase !== 'idle';
  const failed = busy && load === 'failed';
  // The page is off screen, or on its way off, once a turn is let go.
  const away = busy && turn.phase !== 'dragging' && turn.phase !== 'settling';
  // The next page comes in above; the previous one waits below.
  const placeholderOnTop = busy && turn.side === 'next';

  return (
    <div
      ref={surface}
      data-slot="turn-surface"
      className={cn('relative overflow-clip', props.className)}
    >
      <motion.div
        inert={away}
        aria-hidden={away}
        style={{ x: pageX, scale: pageScale, viewTransitionName: 'page-turn' }}
        className={cn(
          'absolute inset-0 bg-background',
          busy && 'ring-1 ring-edge',
          busy && !placeholderOnTop && 'z-10 shadow-2xl',
        )}
      >
        {props.children}
        <Shade opacity={pageShade} />
      </motion.div>
      <motion.div
        inert={!failed}
        aria-hidden={!busy}
        role={busy ? 'status' : undefined}
        aria-label={busy ? 'Loading the page' : undefined}
        style={{
          x: placeholderX,
          scale: placeholderScale,
          visibility: busy ? 'visible' : 'hidden',
        }}
        className={cn(
          'absolute inset-0 overflow-hidden bg-background ring-1 ring-edge',
          placeholderOnTop && 'z-10 shadow-2xl',
        )}
      >
        {busy ? frame(<PendingPage to={turn.to} />) : null}
        {failed ? (
          <div className="absolute inset-0 bg-background">
            {props.failed?.(retry)}
          </div>
        ) : null}
        <Shade opacity={placeholderShade} />
      </motion.div>
      {landed === undefined ? null : (
        <motion.div
          inert
          aria-hidden="true"
          style={{ opacity: veil }}
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-background"
        >
          {frame(<PendingPage to={landed} />)}
        </motion.div>
      )}
    </div>
  );
}
