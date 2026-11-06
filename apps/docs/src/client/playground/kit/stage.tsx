import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import {
  useHtmlCanvasSupport,
  type HtmlCanvasHandle,
} from '@kestack/dune/react';
import { Hud, PerformanceSwitch, usePerformance } from './hud.tsx';

/*
 * A scene's frame: the canvas on the left, and beside it what the scene
 * is, what to try, its settings, and the code that makes it, in that
 * order, each under its own heading.
 */

export function Stage({
  title,
  blurb,
  tryThis,
  code,
  controls,
  canvas,
  children,
}: {
  readonly title: string;
  readonly blurb: string;
  readonly tryThis: ReadonlyArray<string>;
  readonly code: string;
  readonly controls: ReactNode;
  /** The scene's canvas, to show what it costs. */
  readonly canvas?: RefObject<HtmlCanvasHandle | null>;
  readonly children: ReactNode;
}) {
  const [performance, setPerformance] = usePerformance();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
      <main className="relative min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-(--pg-line) bg-(--pg-stage) shadow-[0_1px_2px_oklch(0_0_0/0.3),0_8px_24px_oklch(0_0_0/0.25),0_24px_64px_oklch(0_0_0/0.2)] lg:min-h-0">
        {children}
        {canvas && <Hud canvas={canvas} shown={performance} />}
      </main>
      <aside
        aria-label={`${title}: about and settings`}
        className={`flex w-full shrink-0 flex-col overflow-y-auto rounded-2xl border border-(--pg-line) bg-(--pg-panel) lg:w-[22rem] ${SCROLL}`}
      >
        <header className="px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold tracking-tight text-balance text-(--pg-text)">
            {title}
          </h2>
          <p className="mt-1.5 text-[13px] leading-5 text-pretty text-(--pg-text-3)">
            {blurb}
          </p>
          <SupportNote />
        </header>

        <Section title="Try this">
          <ol className="flex flex-col gap-2.5">
            {tryThis.map((line, i) => (
              <li
                key={line}
                className="flex gap-2.5 text-[13px] leading-5 text-(--pg-text-2)"
              >
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-(--pg-raised) text-[10px] font-medium text-(--pg-text-3) tabular-nums">
                  {i + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Settings">
          <div className="flex flex-col gap-4">
            {canvas && (
              <PerformanceSwitch
                shown={performance}
                onChange={setPerformance}
              />
            )}
            {controls}
          </div>
        </Section>

        <Section title="Code" action={<CopyButton text={code.trim()} />}>
          <pre
            className={`overflow-x-auto rounded-xl border border-(--pg-line) bg-(--pg-sunken) p-3.5 font-mono text-[11.5px] leading-5 text-(--pg-text-2) ${SCROLL}`}
          >
            {code.trim()}
          </pre>
        </Section>
      </aside>
    </div>
  );
}

/** Thin, quiet scrollbars, with their room kept whether they show or not. */
export const SCROLL =
  '[scrollbar-color:var(--pg-control)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]';

function Section({
  title,
  action,
  children,
}: {
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 border-t border-(--pg-line) px-5 py-4"
    >
      <header className="flex h-6 items-center justify-between">
        <h3 className="text-[11px] font-medium tracking-[0.08em] text-(--pg-text-3) uppercase">
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Copies, then says so with a tick for a moment. */
function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
      className="-mr-2 flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-(--pg-text-3) transition-colors duration-150 hover:bg-(--pg-raised) hover:text-(--pg-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus)"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-(--pg-live)" strokeWidth={2} />
      ) : (
        <CopyIcon className="size-3.5" strokeWidth={2} />
      )}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

function SupportNote() {
  const support = useHtmlCanvasSupport();
  if (support === 'current' || support === 'pending') return null;
  return (
    <p className="mt-3 rounded-lg border border-(--pg-warn-text)/25 bg-(--pg-warn-surface) px-3 py-2.5 text-xs leading-5 text-(--pg-warn-text)">
      {support === 'legacy'
        ? 'Running on the older, flagged HTML-in-Canvas API.'
        : 'This browser can’t draw HTML into a canvas, so you see the plain HTML. Open it in Chrome 157 or later.'}
    </p>
  );
}
