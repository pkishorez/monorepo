import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '#lib/utils';

import {
  BASE_H,
  BASE_W,
  HEIGHT_MARGIN,
  makeCanvas,
  SequenceController,
  Stage,
  TransitionProvider,
} from '../internal';

export type { Canvas } from '../internal';

/**
 * A controlled visualizer with a configurable aspect ratio (default 16:9). It
 * renders whatever frame the `sequence` controller currently exposes
 * (`sequence.active`) and owns no playback state of its own — drive it with
 * {@link useSteps}.
 *
 * Scenes are authored against a fixed design width (1920); the height follows
 * the `aspect` prop (width / height). Scenes are
 * **not scaled by a transform**. The stage is sized fluidly (filling the
 * available width, bounded by a viewport-height budget) and a live unit — px
 * per 1% of the stage width — is measured from the real container. Static
 * styles read it through the `--u` CSS variable (`calc(N*var(--u))`); values
 * `motion` animates read it through the {@link Canvas} (`cw`/`ch`) handed to
 * each step's `render`. Because elements render at their true on-screen size,
 * `motion`'s layout projection measures real pixels and corrects in the same
 * space — no scale-induced jitter (a CSS `zoom`/`transform: scale` ancestor
 * would reintroduce it). The canvas is `relative` + `overflow-hidden`, so steps
 * can position children with `absolute inset-0`; inline content is centred.
 * `speed` (seconds) sets the default transition every {@link Div} inherits.
 *
 * The stage ships with **no chrome** — no background, border, radius, or shadow.
 * Pass `className` to style it; `overflow-hidden` clips the scene to whatever
 * border-radius you set there.
 */
export function Screen({
  sequence,
  maxWidth = Infinity,
  speed = 0.7,
  aspect = BASE_W / BASE_H,
  className,
}: {
  sequence: SequenceController;
  /** Cap the stage width (px). Defaults to unbounded. */
  maxWidth?: number;
  /** Default transition duration (seconds) for the scene's `Div`s. Defaults to 0.7. */
  speed?: number;
  /** Design aspect ratio as width / height. Width is fixed; height follows. Defaults to 16/9. */
  aspect?: number;
  className?: string;
}) {
  // Design height derived from the width anchor and the chosen aspect ratio.
  const baseH = BASE_W / aspect;
  const wrapRef = useRef<HTMLDivElement>(null);
  // Unit = px per 1% of stage width. Seeded at the native scale so the first
  // paint matches the design proportions before measurement runs. `ready` gates
  // the first paint: until the real container has been measured the unit is only
  // a guess, so the stage is kept hidden to avoid a visible scale jump on load.
  const [unit, setUnit] = useState(BASE_W / 100);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const available = Math.min(
        wrapRef.current?.clientWidth ?? BASE_W,
        maxWidth,
      );
      // Honor both budgets: never wider than the container, never taller than
      // the viewport minus chrome. Cap at native so the stage never grows past
      // its design size. Expressed as a unit (not a zoom) — no scaling ancestor.
      const heightBudget = window.innerHeight - HEIGHT_MARGIN;
      const widthUnit = available / 100;
      const heightUnit = (heightBudget * (BASE_W / baseH)) / 100;
      setUnit(Math.max(1, Math.min(widthUnit, heightUnit, BASE_W / 100)));
      setReady(true);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [maxWidth, baseH]);

  const { active } = sequence;
  const canvas = makeCanvas(unit, baseH);

  return (
    <div ref={wrapRef} className="flex w-full justify-center">
      <div
        style={
          {
            // Fluid: fill the width budget, derive height from the configured
            // aspect ratio. No transform — elements render at real size, which
            // keeps motion's layout projection exact.
            width: '100%',
            maxWidth: unit * 100,
            aspectRatio: aspect,
            // `--u` = 1% of the stage width (px), measured live. Scenes size
            // static content as `calc(N*var(--u))`; it stays proportional with
            // no `container-type` containment to desync motion's projection.
            '--u': `${unit}px`,
            // Unscaled twin of `--u`. Scenes that want to scale every sized
            // element at once can redefine `--u: calc(var(--u0) * k)` on a
            // wrapper — reading `--u0` (not `--u`) avoids a self-referential
            // custom-property cycle.
            '--u0': `${unit}px`,
          } as CSSProperties
        }
        className={cn(
          // Structural only — no chrome. `overflow-hidden` clips the scene to
          // whatever border-radius the caller sets via `className`. Bring your
          // own background, border, radius, and shadow.
          'relative flex items-center justify-center overflow-hidden',
          className,
        )}
      >
        {/* Mount the scene only once the unit is measured: motion's layout
            projection records each element's baseline on mount, so mounting at
            the seeded (native) unit and then shrinking would animate a spurious
            zoom-out. Mounting at the final unit gives a zero-delta first frame. */}
        {ready && (
          <TransitionProvider duration={speed}>
            <Stage>{active.render(active.props, canvas)}</Stage>
          </TransitionProvider>
        )}
      </div>
    </div>
  );
}
