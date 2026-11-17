import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Engine,
  canvasAttributes,
  drawableAttributes,
  type EffectInstance,
  type Lamp,
  type Stats,
} from '../../core/index.ts';
import { LampsContext, type Lamps } from './context.ts';
import { useHtmlCanvasSupport } from './support.ts';

/*
 * <HtmlCanvas> draws its children, real and interactive React, into a
 * canvas and runs shaders over them:
 *
 *   <HtmlCanvas effect={lighting()}>
 *     <LoginForm />
 *   </HtmlCanvas>
 *
 * The children stay in the DOM: they take clicks, focus, typing and
 * selection, and screen readers read them. Where the browser can't draw
 * HTML into a canvas, they are drawn as plain HTML instead.
 */

/** Reaches into a running <HtmlCanvas>: to measure it. */
export type HtmlCanvasHandle = {
  /** Averages since the last call, or null while drawing plain HTML. */
  readonly stats: () => Stats | null;
  /** ms per frame drawn back to back and waited on; null on plain HTML. */
  readonly benchmark: (frames?: number) => number | null;
};

export type HtmlCanvasProps = {
  /** One effect, or several run in order, each over the one before. */
  readonly effect?: EffectInstance | ReadonlyArray<EffectInstance>;
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Classes for the box the children are laid out in; it fills the canvas. */
  readonly contentClassName?: string;
  /** Drawn instead where the browser can't. Defaults to the children as plain HTML. */
  readonly fallback?: ReactNode;
  /** Stops time. The canvas still redraws as the HTML changes. */
  readonly paused?: boolean;
  readonly onError?: (error: Error) => void;
  /** Draws the children as plain HTML even where a canvas could: for comparing. */
  readonly plain?: boolean;
  readonly ref?: Ref<HtmlCanvasHandle>;
};

const fill: CSSProperties = { width: '100%', height: '100%' };

export function HtmlCanvas({
  effect,
  children,
  className,
  style,
  contentClassName,
  fallback,
  paused = false,
  onError,
  plain = false,
  ref,
}: HtmlCanvasProps) {
  const support = useHtmlCanvasSupport();
  const canvas = useRef<HTMLCanvasElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const lamps = useRef(new Set<Lamp>());
  const latest = useRef({ effect, onError });
  latest.current = { effect, onError };
  const [registry] = useState<Lamps>(() => ({
    add: (lamp) => {
      lamps.current.add(lamp);
      return () => lamps.current.delete(lamp);
    },
  }));
  const [broken, setBroken] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      stats: () => engine.current?.stats() ?? null,
      benchmark: (frames) => engine.current?.benchmark(frames) ?? null,
    }),
    [],
  );

  const api =
    !plain && (support === 'current' || support === 'legacy') ? support : null;

  useEffect(() => {
    if (!api || !canvas.current || !content.current) return;
    try {
      const created = new Engine({
        canvas: canvas.current,
        content: content.current,
        api,
        lamps: () => lamps.current,
        onError: (error) => latest.current.onError?.(error),
      });
      engine.current = created;
      created.setEffects(list(latest.current.effect));
      return () => {
        created.dispose();
        engine.current = null;
      };
    } catch (error) {
      latest.current.onError?.(error as Error);
      setBroken(true);
      return;
    }
  }, [api]);

  // Every render: cheap unless the list of effects changed.
  useEffect(() => {
    engine.current?.setEffects(list(effect));
  });

  useEffect(() => {
    engine.current?.setPaused(paused);
  }, [paused]);

  if (!api || broken)
    return (
      <LampsContext.Provider value={registry}>
        <div className={className} style={style}>
          {fallback ?? (
            <div className={contentClassName} style={fill}>
              {children}
            </div>
          )}
        </div>
      </LampsContext.Provider>
    );

  return (
    <LampsContext.Provider value={registry}>
      <canvas
        ref={canvas}
        className={className}
        style={{ display: 'block', ...fill, ...style }}
        {...canvasAttributes}
      >
        <div
          ref={content}
          className={contentClassName}
          style={fill}
          {...drawableAttributes}
        >
          {children}
        </div>
      </canvas>
    </LampsContext.Provider>
  );
}

const list = (
  effect: HtmlCanvasProps['effect'],
): ReadonlyArray<EffectInstance> =>
  effect === undefined
    ? []
    : Array.isArray(effect)
      ? effect
      : [effect as EffectInstance];
