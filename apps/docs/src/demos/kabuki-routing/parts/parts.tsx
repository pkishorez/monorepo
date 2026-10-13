// oxlint-disable-next-line no-restricted-imports -- Escape closes a dialog, a key only a listener on window hears.
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export function Button({
  children,
  onClick,
  tone = 'plain',
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly tone?: 'plain' | 'primary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-[background-color,scale] duration-150 ease-out outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.97] ${
        tone === 'primary'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-border bg-background hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

/** One page's heading and what it is for. */
export function Page({
  title,
  about,
  children,
}: {
  readonly title: string;
  readonly about?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {about && (
          <p className="max-w-prose text-[13px] leading-relaxed text-muted-foreground">
            {about}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * One routing case the page shows: what it is, why it matters, and what to
 * try. The demo's explanations live here, beside the thing they explain.
 */
export function Case({
  title,
  children,
  tries,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly tries?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-border bg-muted/30 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-[13px] font-medium">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
      {tries && (
        <div className="flex flex-wrap items-center gap-2">{tries}</div>
      )}
    </div>
  );
}

/** A link styled as a small chip, for the things to try. */
export const chip =
  'inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium transition-colors duration-150 outline-offset-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring';

/** A Worker that is running, and how many times it has done its work. */
export function Running({
  name,
  count,
}: {
  readonly name: string;
  readonly count: number;
}) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-700 tabular-nums dark:text-emerald-400">
      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
      Worker <code className="font-mono">{name}</code> · {count}
    </span>
  );
}

export function Card({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
      {children}
    </div>
  );
}

/** A dialog's panel. It closes on Escape by asking `onClose`; the backdrop is the caller's. */
export function DialogPanel({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-label={title}
      className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-background p-5 shadow-[0_8px_32px_-8px_rgb(0_0_0/0.25)]"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Close
        </button>
      </div>
      {children}
    </div>
  );
}

/** A tab between sibling pages; `aria-current="page"` marks the open one. */
export const tab =
  'rounded-md px-2.5 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground';
