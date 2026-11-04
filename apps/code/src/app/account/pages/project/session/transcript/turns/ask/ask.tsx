import {
  CheckIcon,
  ChevronDownIcon,
  BotIcon,
  CopyIcon,
  RotateCcwIcon,
  SquareTerminalIcon,
  ZapIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { notify } from '../../../../../../../../ui/controls/notice/index.ts';
import {
  type Opening,
  unlessSelecting,
  useHeight,
  useFoldInPlace,
  useOpen,
} from '../../words/index.ts';
import type { CutOff, Row } from '../rows/index.ts';
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
 * way, in place of the prompt Connect sent, with what the restart stopped
 * under it: the turn, and each subagent and command that was running. A
 * message sent after the agent stopped with work still running says what
 * was stopped too.
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
      <div className="flex flex-col items-center gap-2">
        <p className="flex w-full items-center gap-3 text-xs text-muted-foreground">
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span className="flex shrink-0 items-center gap-1.5">
            <RotateCcwIcon aria-hidden className="size-3.5" />
            Resumed after Connect restarted
          </span>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </p>
        {row.cutOff !== null && <Stopped cutOff={row.cutOff} />}
      </div>
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
      {row.cutOff !== null && row.cutOff.jobs.length > 0 && (
        <div className="pt-1 flex flex-col items-end">
          <Stopped cutOff={row.cutOff} align="end" />
        </div>
      )}
    </div>
  );
}

/** What a stop cut off, as the agent was told it: the turn, then each job. */
function Stopped({
  cutOff,
  align = 'center',
}: {
  readonly cutOff: CutOff;
  readonly align?: 'center' | 'end';
}) {
  if (!cutOff.turn && cutOff.jobs.length === 0) return null;
  const items = [
    ...(cutOff.turn
      ? [{ icon: RotateCcwIcon, title: 'Its last turn', code: false }]
      : []),
    ...cutOff.jobs.map((job) => ({
      icon: job.kind === 'agent' ? BotIcon : SquareTerminalIcon,
      title: job.title,
      code: job.kind === 'shell',
    })),
  ];
  return (
    <div
      className={`flex max-w-full flex-col gap-1 text-xs text-muted-foreground ${align === 'end' ? 'items-end' : 'items-center'}`}
    >
      <span>
        {align === 'center'
          ? 'Stopped by the restart, and told to the agent:'
          : 'Stopped before this, and told to the agent:'}
      </span>
      <ul className="flex max-w-full flex-col gap-0.5">
        {items.map(({ icon: Icon, title }, at) => (
          <li
            key={at}
            className="flex min-w-0 items-center gap-1.5 text-muted-foreground/80"
          >
            <Icon aria-hidden className="size-3 shrink-0" />
            <span className="min-w-0 truncate" title={title}>
              {title}
            </span>
          </li>
        ))}
      </ul>
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
  // Measured before it is first shown, so a tall one never draws unfolded
  // first, and again as the column's width changes how it wraps.
  const tall = useHeight(words) > TALL;
  const open = useOpen(opening, id);
  const inPlace = useFoldInPlace();
  // Folded with its top gone up out of sight, it is folded where it shows.
  const toggle = () => {
    inPlace(words.current, open);
    opening.toggle(id);
  };
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
        void (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(
          () => setCopied(true),
          () =>
            notify({
              title: "Couldn't copy",
              description: 'Allow Code to use the clipboard, then try again.',
              seconds: 4,
            }),
        );
      }}
      className={`${BUTTON} -mr-1 ${copied ? 'opacity-100' : QUIET}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
