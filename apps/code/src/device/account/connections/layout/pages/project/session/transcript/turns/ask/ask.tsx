import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  RotateCcwIcon,
  ZapIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type Opening,
  unlessSelecting,
  useOpen,
  useShutInPlace,
} from '../../words/index.ts';
import type { Row } from '../rows/index.ts';
import { Attachments } from './attachments.tsx';

/*
 * What you asked, on the right, as a bubble: its files over it, and under
 * it one quiet row: for words sent while the agent worked, a note saying
 * so, then a way to copy them. The row shows on pointing at the bubble,
 * and always on a touch screen. A bubble taller than TALL is drawn folded,
 * its foot fading out: a click or tap on it, or Show more in its row,
 * opens it, and again folds it, unless the click was to select its words;
 * whether it is open is kept with the transcript's other folds.
 * Wider on a phone, where the column is narrow. A turn the agent began on
 * its own has no words: a quiet rule across the column says why it
 * carried on. A turn Connect Resumed after a restart says so the same
 * way, in place of the prompt Connect sent.
 */

type TurnRow = Extract<Row, { readonly kind: 'turn' }>;

/** Taller than this, in px, a bubble is drawn folded. */
const TALL = 300;

/** How tall a folded bubble is drawn, in px: short of TALL, so folding hides more than a line. */
const FOLDED = 220;

/** Shown on pointing at the bubble, or focus; always on a touch screen. */
const QUIET =
  'opacity-0 transition-opacity duration-150 group-hover/ask:opacity-100 group-focus-within/ask:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100';

const BUTTON =
  'focus-ring grid size-11 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground keyboard:size-7 [&_svg]:size-3.5';

export function Ask({
  row,
  opening,
}: {
  readonly row: TurnRow;
  readonly opening: Opening;
}) {
  if (row.resumed)
    return (
      <p className="flex items-center gap-3 text-xs text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="flex shrink-0 items-center gap-1.5">
          <RotateCcwIcon aria-hidden className="size-3.5" />
          Resumed after Connect restarted
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </p>
    );
  if (row.agentStarted)
    return (
      <p className="flex items-center gap-3 text-xs text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="flex shrink-0 items-center gap-1.5">
          <ZapIcon aria-hidden className="size-3.5" />
          Background work finished · it carried on
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </p>
    );
  return (
    <div className="group/ask flex flex-col items-end gap-1 pl-8 sm:pl-16">
      <Attachments attachments={row.attachments} />
      {row.text !== '' && (
        <Bubble
          id={row.id}
          opening={opening}
          text={row.text}
          steered={row.steered}
        />
      )}
      {row.text === '' && row.steered && (
        <span className="text-xs text-muted-foreground">
          Sent while it worked
        </span>
      )}
    </div>
  );
}

/** The words, folded while tall, with their row under them. */
function Bubble({
  id,
  opening,
  text,
  steered,
}: {
  readonly id: string;
  readonly opening: Opening;
  readonly text: string;
  readonly steered: boolean;
}) {
  const words = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const open = useOpen(opening, id);
  const inPlace = useShutInPlace();
  // Folded from below its top, out of sight: its foot stays where it was.
  const toggle = () => {
    const element = words.current;
    const view = element?.closest('[data-scroll-restoration-id]');
    if (open && element && view)
      inPlace(
        Math.min(
          element.offsetHeight - FOLDED,
          view.getBoundingClientRect().top -
            element.getBoundingClientRect().top,
        ),
      );
    opening.toggle(id);
  };
  // Measured before it is first shown, so a tall one never draws unfolded
  // first, and again as the column's width changes how it wraps.
  useLayoutEffect(() => {
    const element = words.current;
    if (!element) return;
    const measure = () => setTall(element.scrollHeight > TALL);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);
  const folded = tall && !open;
  return (
    <>
      <div
        ref={words}
        data-folded={folded || undefined}
        onClick={tall ? unlessSelecting(toggle) : undefined}
        style={folded ? { maxHeight: FOLDED } : undefined}
        className={`max-w-full overflow-hidden rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-base leading-7 text-pretty break-words whitespace-pre-wrap ${tall ? 'cursor-pointer' : ''} ${folded ? '[mask-image:linear-gradient(to_bottom,black_60%,transparent)]' : ''}`}
      >
        {text}
      </div>
      <div className="flex min-h-8 items-center gap-1 text-xs text-muted-foreground">
        {steered && <span className="mr-1">Sent while it worked</span>}
        {tall && (
          <button
            type="button"
            aria-expanded={open}
            onClick={toggle}
            className={`focus-ring flex h-11 items-center gap-1 rounded-md px-2 transition-colors duration-150 hover:bg-muted hover:text-foreground keyboard:h-7 ${folded ? '' : QUIET}`}
          >
            {open ? 'Show less' : 'Show more'}
            <ChevronDownIcon
              aria-hidden
              className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            />
          </button>
        )}
        <Copy text={text} />
      </div>
    </>
  );
}

/** Copies the words, and says so for a moment. */
function Copy({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : 'Copy the message'}
      title="Copy the message"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
      className={`${BUTTON} -mr-1 ${copied ? 'opacity-100' : QUIET}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
