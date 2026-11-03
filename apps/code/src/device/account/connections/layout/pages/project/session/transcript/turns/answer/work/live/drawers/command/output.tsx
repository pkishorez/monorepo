import { memo, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownIcon } from 'lucide-react';
import {
  type Color,
  EMPTY,
  feed,
  type Line as ScreenLine,
  linesOf,
  type Screen,
  type Span,
} from './ansi.ts';

/*
 * What a command writes, as a terminal shows it: in its colours, its
 * links made links, a line too long for the pane wrapped. It follows the
 * end as more comes while you are at it; scrolled up, it stays, and a
 * button goes back to the end.
 */

/** The sixteen terminal colours, in the theme's own, for text. */
const FG: ReadonlyArray<string> = [
  'text-muted-foreground',
  'text-red-600 dark:text-red-400',
  'text-green-600 dark:text-green-400',
  'text-yellow-700 dark:text-yellow-300',
  'text-blue-600 dark:text-blue-400',
  'text-fuchsia-600 dark:text-fuchsia-400',
  'text-cyan-700 dark:text-cyan-400',
  'text-foreground',
  'text-muted-foreground',
  'text-red-500 dark:text-red-300',
  'text-green-500 dark:text-green-300',
  'text-yellow-600 dark:text-yellow-200',
  'text-blue-500 dark:text-blue-300',
  'text-fuchsia-500 dark:text-fuchsia-300',
  'text-cyan-600 dark:text-cyan-300',
  'text-foreground',
];

/** And behind text. */
const BG: ReadonlyArray<string> = [
  'bg-foreground/10',
  'bg-red-500/20',
  'bg-green-500/20',
  'bg-yellow-500/25',
  'bg-blue-500/20',
  'bg-fuchsia-500/20',
  'bg-cyan-500/20',
  'bg-foreground/15',
  'bg-foreground/10',
  'bg-red-500/30',
  'bg-green-500/30',
  'bg-yellow-500/35',
  'bg-blue-500/30',
  'bg-fuchsia-500/30',
  'bg-cyan-500/30',
  'bg-foreground/20',
];

const colourOf = (color: Color | null, named: ReadonlyArray<string>) =>
  typeof color === 'number' ? named[color] : undefined;

const cssOf = (color: Color | null) =>
  typeof color === 'string' ? color : undefined;

const LINK = /https?:\/\/[^\s<>"'`|]+[^\s<>"'`|.,;:!?)\]]/g;

/** Text, with each web address in it a link. */
function Linked({ text }: { readonly text: string }) {
  const parts: Array<string | { readonly href: string }> = [];
  let at = 0;
  for (const found of text.matchAll(LINK)) {
    parts.push(text.slice(at, found.index));
    parts.push({ href: found[0] });
    at = found.index + found[0].length;
  }
  if (at === 0) return text;
  parts.push(text.slice(at));
  return parts.map((part, i) =>
    typeof part === 'string' ? (
      part
    ) : (
      <a
        key={i}
        href={part.href}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
      >
        {part.href}
      </a>
    ),
  );
}

function Piece({ span }: { readonly span: Span }) {
  const { style } = span;
  const className = [
    colourOf(style.fg, FG),
    colourOf(style.bg, BG),
    style.bold && 'font-semibold',
    style.dim && 'opacity-60',
    style.italic && 'italic',
    style.underline && 'underline',
  ]
    .filter((each) => typeof each === 'string')
    .join(' ');
  const css = { color: cssOf(style.fg), backgroundColor: cssOf(style.bg) };
  if (
    className === '' &&
    css.color === undefined &&
    css.backgroundColor === undefined
  )
    return <Linked text={span.text} />;
  return (
    <span className={className} style={css}>
      <Linked text={span.text} />
    </span>
  );
}

/** One line, drawn again only when it changes. */
const Line = memo(function Line({ line }: { readonly line: ScreenLine }) {
  return (
    <div className="min-h-5 whitespace-pre-wrap wrap-break-word">
      {line.map((span, i) => (
        <Piece key={i} span={span} />
      ))}
    </div>
  );
});

/** What a command wrote, as `useScreen` reads it. */
export interface Shown {
  readonly lines: ReadonlyArray<ScreenLine>;
  /** How many lines were dropped before the first. */
  readonly first: number;
}

/**
 * The screen of what a command wrote, read only from what is new: the
 * pieces past those read already, counted from its first, so a piece the
 * page dropped from its start is not read again. A new read of it, `key`,
 * starts the screen again.
 */
export const useScreen = (
  key: string,
  pieces: ReadonlyArray<string>,
  dropped: number,
): Shown => {
  const read = useRef({ key, count: 0, screen: EMPTY as Screen });
  if (read.current.key !== key) read.current = { key, count: 0, screen: EMPTY };
  const total = dropped + pieces.length;
  if (read.current.count < total) {
    let { screen } = read.current;
    for (let n = Math.max(read.current.count, dropped); n < total; n++)
      screen = feed(screen, pieces[n - dropped]!);
    read.current = { key, count: total, screen };
  }
  const { screen } = read.current;
  return { lines: linesOf(screen), first: screen.first };
};

/** How near the end counts as at it, in px. */
const AT_END = 24;

export function Output({
  shown: { lines, first },
  live,
}: {
  /** What it wrote, as `useScreen` reads it. */
  readonly shown: Shown;
  /** Whether it still runs, and may write more. */
  readonly live: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  useLayoutEffect(() => {
    const element = box.current;
    if (following && element !== null) element.scrollTop = element.scrollHeight;
  }, [lines, following]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/70 bg-muted/40">
      <div
        ref={box}
        role="log"
        aria-label="Output"
        aria-live="off"
        tabIndex={0}
        onScroll={(event) => {
          const element = event.currentTarget;
          setFollowing(
            element.scrollHeight - element.scrollTop - element.clientHeight <
              AT_END,
          );
        }}
        className="focus-ring min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-2.5 font-mono text-xs leading-5 select-text [tab-size:4]"
      >
        {lines.length === 0 ? (
          <p className="font-sans text-muted-foreground">
            {live ? 'Nothing written yet.' : 'It wrote nothing.'}
          </p>
        ) : (
          // Keyed by line number, so a line dropped from the top redraws
          // none of the rest.
          lines.map((line, i) => <Line key={first + i} line={line} />)
        )}
      </div>
      {!following && (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          className="focus-ring absolute bottom-2.5 left-1/2 flex h-8 -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 text-xs shadow-sm backdrop-blur-md transition-[scale] duration-150 active:scale-[0.97] pointer-coarse:h-10 motion-reduce:transition-none"
        >
          <ArrowDownIcon aria-hidden className="size-3.5" />
          Jump to latest
        </button>
      )}
    </div>
  );
}
