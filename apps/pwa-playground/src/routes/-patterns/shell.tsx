import { type Pointers, useGesture } from '@kstackz/use-gesture';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { SlidersHorizontalIcon, XIcon } from '@kstackz/ui-toolkit/lucide';
import { motion, useMotionValueEvent } from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useState } from 'react';

export type PatternGuide = {
  readonly try: ReadonlyArray<ReactNode>;
  readonly expect: ReadonlyArray<ReactNode>;
};

function GuideView(props: { readonly guide: PatternGuide }) {
  return (
    <div className="flex flex-col gap-4 text-[13px] leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs">
      <section>
        <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Try
        </h3>
        <ol className="list-decimal space-y-1 pl-5">
          {props.guide.try.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>
      <section>
        <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          What happens
        </h3>
        <ul className="space-y-1">
          {props.guide.expect.map((item, i) => (
            <li key={i} className="grid grid-cols-[1rem_1fr]">
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Every finger of the Gesture its zone hears, drawn over everything: a ring
 * per finger, so what the Pattern does can be read against the touch.
 */
export function Touches() {
  const { pointers } = useGesture();
  const [shown, setShown] = useState<Pointers>(pointers.get());
  useMotionValueEvent(pointers, 'change', setShown);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {[...shown.values()].map((pointer) => (
        <motion.div
          key={pointer.id}
          style={{ x: pointer.x, y: pointer.y }}
          className={cn(
            'absolute top-0 left-0 -mt-6 -ml-6 size-12 rounded-full border-[3px] border-foreground/70 bg-foreground/10',
            pointer.end !== undefined && 'opacity-30',
          )}
        />
      ))}
    </div>
  );
}

/** One `name value` pair in the status bar, in a fixed width. */
export function Stat(props: {
  readonly name: string;
  readonly children: ReactNode;
  readonly width: string;
}) {
  return (
    <span className="flex shrink-0 items-baseline gap-1">
      <span className="text-muted-foreground">{props.name}</span>
      <span
        style={{ width: props.width }}
        className="inline-block truncate text-foreground tabular-nums"
      >
        {props.children}
      </span>
    </span>
  );
}

type Sheet = 'guide' | 'options' | undefined;

/**
 * A Pattern shown as a real screen. The header, the status bar and the
 * sheets over the stage are marked disabled for zones, so they work while
 * a Gesture runs and never join it. Sheets cover the stage rather than
 * push it, so nothing on the screen moves when one opens.
 */
export function PatternScreen(props: {
  readonly title: string;
  readonly start: ReactNode;
  readonly end: ReactNode;
  readonly guide: PatternGuide;
  readonly options: ReactNode;
  /** The app screen: a GestureProvider and its zones. */
  readonly children: ReactNode;
}) {
  const [sheet, setSheet] = useState<Sheet>('guide');
  const toggle = (next: Exclude<Sheet, undefined>) =>
    setSheet((current) => (current === next ? undefined : next));
  return (
    <div className="fixed inset-0 flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header
        data-zone-gesture="disabled"
        className="box-content flex h-12 shrink-0 items-center gap-1 border-b border-border pt-[max(12px,env(safe-area-inset-top))] pr-[max(0.25rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]"
      >
        {props.start}
        <h1 className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
          {props.title}
        </h1>
        <Button
          size="sm"
          variant={sheet === 'guide' ? 'default' : 'ghost'}
          aria-pressed={sheet === 'guide'}
          onClick={() => toggle('guide')}
          className="w-16"
        >
          Guide
        </Button>
        <Button
          size="icon"
          variant={sheet === 'options' ? 'default' : 'ghost'}
          aria-label="Options"
          aria-pressed={sheet === 'options'}
          onClick={() => toggle('options')}
          className="size-9"
        >
          <SlidersHorizontalIcon aria-hidden="true" />
        </Button>
        {props.end}
      </header>
      <div className="relative min-h-0 flex-1">
        {props.children}
        {sheet === undefined ? null : (
          <section
            data-zone-gesture="disabled"
            aria-label={sheet === 'guide' ? 'Guide' : 'Options'}
            className="absolute inset-x-2 top-2 z-40 flex max-h-[70%] flex-col rounded-xl bg-card shadow-xl ring-1 ring-foreground/10"
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-border pr-1 pl-3">
              <h2 className="text-sm font-medium">
                {sheet === 'guide' ? 'Guide' : 'Options'}
              </h2>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Close"
                onClick={() => setSheet(undefined)}
                className="size-8"
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
            <div className="min-h-0 overflow-y-auto p-3 [scrollbar-gutter:stable]">
              {sheet === 'guide' ? (
                <GuideView guide={props.guide} />
              ) : (
                <div className="flex flex-col items-start gap-2">
                  {props.options}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** The fixed-height strip under the stage with a Pattern's live values. */
export function StatusBar(props: { readonly children: ReactNode }) {
  return (
    <div
      data-zone-gesture="disabled"
      className="box-content flex h-10 shrink-0 items-center gap-3 overflow-hidden border-t border-border bg-card px-3 pb-[env(safe-area-inset-bottom)] font-mono text-[11px] whitespace-nowrap"
    >
      {props.children}
    </div>
  );
}
