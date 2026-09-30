import { SourceViewer } from '@kstackz/ui-toolkit/components/blocks/source-viewer';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Slider } from '@kstackz/ui-toolkit/components/ui/slider';
import {
  motion,
  type MotionValue,
  useTransform,
  useVelocity,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

/**
 * One lesson: the idea in plain words, a live demo with its knobs, the
 * Framer Motion code, and what to take away.
 */
export function Lesson(props: {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly idea: ReactNode;
  readonly demo: ReactNode;
  readonly controls?: ReactNode;
  readonly code: string;
  readonly takeaways?: ReadonlyArray<ReactNode>;
  /** Extra material between the demo and the code, such as a glossary. */
  readonly children?: ReactNode;
}) {
  return (
    <article
      id={props.id}
      aria-labelledby={`${props.id}-title`}
      className="flex scroll-mt-20 flex-col gap-5 border-t border-border pt-10"
    >
      <header className="flex max-w-[68ch] flex-col gap-3">
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          Lesson {props.number}
        </p>
        <h3
          id={`${props.id}-title`}
          className="text-2xl font-semibold tracking-tight text-balance"
        >
          {props.title}
        </h3>
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-pretty text-muted-foreground [&_b]:font-medium [&_b]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground">
          {props.idea}
        </div>
      </header>

      <div
        className={cn(
          'grid gap-4 rounded-xl bg-card p-4 ring-1 ring-edge sm:p-5',
          props.controls !== undefined && 'lg:grid-cols-[minmax(0,1fr)_15rem]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-3">{props.demo}</div>
        {props.controls === undefined ? null : (
          <div className="flex flex-col gap-4 lg:border-l lg:border-border lg:pl-5">
            {props.controls}
          </div>
        )}
      </div>

      {props.children}

      <Code code={props.code} />

      {props.takeaways === undefined ? null : (
        <ul className="flex max-w-[68ch] flex-col gap-2 text-sm leading-relaxed text-pretty [&_code]:font-mono [&_code]:text-[13px]">
          {props.takeaways.map((item, i) => (
            <li key={i} className="grid grid-cols-[1rem_1fr] gap-2">
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function Code(props: { readonly code: string }) {
  return (
    <SourceViewer
      filePath="lesson.tsx"
      content={props.code.trim()}
      showHeader={false}
      showLineNumbers={false}
      autoHeight
      wrap
      className="overflow-hidden rounded-lg border text-[13px]"
    />
  );
}

/** A labelled slider showing its value; the knob every lesson turns. */
export function Knob(props: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit?: string;
  readonly hint?: string;
  readonly onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label id={id} className="font-mono text-xs">
          {props.label}
        </label>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {props.value}
          {props.unit ?? ''}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onValueChange={(value) =>
          props.onChange(Array.isArray(value) ? value[0] : value)
        }
      />
      {props.hint === undefined ? null : (
        <p className="text-xs leading-snug text-pretty text-muted-foreground">
          {props.hint}
        </p>
      )}
    </div>
  );
}

/** One choice from a few, as a row of small buttons. */
export function Choice<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: string;
  }>;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-xs">{props.label}</span>
      <div
        role="radiogroup"
        aria-label={props.label}
        className="flex flex-wrap gap-1"
      >
        {props.options.map((option) => (
          <Button
            key={option.value}
            role="radio"
            aria-checked={props.value === option.value}
            size="xs"
            variant={props.value === option.value ? 'default' : 'outline'}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** The box a demo plays in. */
export function Stage(props: {
  readonly ref?: Ref<HTMLDivElement>;
  readonly className?: string;
  readonly label?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div
      ref={props.ref}
      className={cn(
        'relative h-56 touch-none overflow-hidden rounded-lg bg-muted/50 ring-1 ring-foreground/5 select-none',
        props.className,
      )}
    >
      {props.label === undefined ? null : (
        <span className="pointer-events-none absolute top-2 left-3 font-mono text-[11px] text-muted-foreground">
          {props.label}
        </span>
      )}
      {props.children}
    </div>
  );
}

export const PUCK = 48;

/** The round thing most demos move. */
export const puckClass =
  'absolute top-0 left-0 size-12 cursor-grab rounded-full bg-chart-8 shadow-md active:cursor-grabbing';

/** A motion value shown as text, with no React render per change. */
export function Live(props: { readonly value: MotionValue<string> }) {
  return <motion.span className="tabular-nums">{props.value}</motion.span>;
}

/** A row of live readouts under a demo. */
export function Readouts(props: {
  readonly items: ReadonlyArray<{
    readonly label: string;
    readonly value: ReactNode;
  }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs sm:grid-cols-4">
      {props.items.map((item) => (
        <div key={item.label} className="flex flex-col">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Live speed of a value in px/s, with a bar that fills with it. */
export function SpeedMeter(props: {
  readonly label: string;
  readonly speed: MotionValue<number>;
  readonly max?: number;
}) {
  const max = props.max ?? 3000;
  const text = useTransform(
    () => `${Math.round(Math.abs(props.speed.get()))} px/s`,
  );
  const width = useTransform(
    () => `${Math.min(100, (Math.abs(props.speed.get()) / max) * 100)}%`,
  );
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between font-mono text-xs">
        <span className="text-muted-foreground">{props.label}</span>
        <Live value={text} />
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div style={{ width }} className="h-full bg-chart-7" />
      </div>
    </div>
  );
}

/** `useVelocity` for two axes, combined into one speed. */
export function useSpeed(
  x: MotionValue<number>,
  y: MotionValue<number>,
): MotionValue<number> {
  const vx = useVelocity(x);
  const vy = useVelocity(y);
  return useTransform(() => Math.hypot(vx.get(), vy.get()));
}

export type Series = {
  readonly label: string;
  readonly value: MotionValue<number>;
  readonly min: number;
  readonly max: number;
  readonly tone?: 'main' | 'alt' | 'speed';
};

const TONE = {
  main: 'stroke-foreground',
  alt: 'stroke-chart-8',
  speed: 'stroke-chart-7',
} as const;

const SWATCH = {
  main: 'bg-foreground',
  alt: 'bg-chart-8',
  speed: 'bg-chart-7',
} as const;

const W = 600;
const H = 120;

/**
 * A strip chart: each value over the last few seconds, newest on the right,
 * so a stop shows as a corner, a glide as a curve and a bounce as a wave.
 * Guides are dashed lines on the first series' scale. It samples only while
 * on screen.
 */
export function Trace(props: {
  readonly series: ReadonlyArray<Series>;
  readonly guides?: ReadonlyArray<{
    readonly at: number;
    readonly label: string;
  }>;
  readonly span?: number;
  readonly caption?: string;
}) {
  const span = props.span ?? 3000;
  const svg = useRef<SVGSVGElement>(null);
  const paths = useRef<Array<SVGPathElement | null>>([]);
  const latest = useRef(props.series);
  latest.current = props.series;

  useEffect(() => {
    const element = svg.current;
    if (element === null) return;
    const samples = latest.current.map(() => [] as Array<[number, number]>);
    let frame = 0;
    let visible = false;
    const draw = () => {
      const now = performance.now();
      latest.current.forEach((series, i) => {
        const list = (samples[i] ??= []);
        list.push([now, series.value.get()]);
        while (list.length > 0 && now - list[0][0] > span) list.shift();
        const range = series.max - series.min || 1;
        const d = list
          .map(([t, v], j) => {
            const px = ((t - (now - span)) / span) * W;
            const py = H - ((v - series.min) / range) * H;
            const clamped = Math.max(-4, Math.min(H + 4, py));
            return `${j === 0 ? 'M' : 'L'}${px.toFixed(1)} ${clamped.toFixed(1)}`;
          })
          .join('');
        paths.current[i]?.setAttribute('d', d);
      });
      if (visible) frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry?.isIntersecting ?? false;
      if (visible && !was) frame = requestAnimationFrame(draw);
      if (!visible) cancelAnimationFrame(frame);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [span]);

  const first = props.series[0];
  const guideY = (at: number) =>
    first === undefined
      ? 0
      : H - ((at - first.min) / (first.max - first.min || 1)) * H;

  return (
    <figure className="flex flex-col gap-1.5">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-24 w-full overflow-visible rounded-md bg-muted/30"
        aria-hidden="true"
      >
        {props.guides?.map((guide) => (
          <line
            key={guide.label}
            x1={0}
            x2={W}
            y1={guideY(guide.at)}
            y2={guideY(guide.at)}
            className="stroke-muted-foreground/50"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {props.series.map((series, i) => (
          <path
            key={series.label}
            ref={(node) => {
              paths.current[i] = node;
            }}
            fill="none"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className={TONE[series.tone ?? 'main']}
          />
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
        {props.series.map((series) => (
          <span key={series.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn('h-0.5 w-3 rounded', SWATCH[series.tone ?? 'main'])}
            />
            {series.label}
          </span>
        ))}
        {props.guides === undefined || props.guides.length === 0 ? null : (
          <span>
            dashed: {props.guides.map((guide) => guide.label).join(', ')}
          </span>
        )}
        <span className="ml-auto">
          {props.caption ?? `last ${span / 1000}s, time runs left to right`}
        </span>
      </figcaption>
    </figure>
  );
}

/** The width of an element, kept current as it resizes. */
export function useWidth(ref: { readonly current: HTMLElement | null }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** A spring's damping ratio: under 1 bounces, 1 lands clean, over 1 creeps. */
export const dampingRatio = (spring: {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}) => spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));

export const describeRatio = (ratio: number) =>
  ratio < 0.3
    ? 'very bouncy: wobbles several times'
    : ratio < 0.7
      ? 'bouncy: overshoots, then settles'
      : ratio < 0.95
        ? 'lively: one small overshoot'
        : ratio <= 1.05
          ? 'critically damped: lands without overshooting'
          : 'overdamped: slides in slowly, no overshoot';
