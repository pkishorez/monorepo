import {
  ArchiveIcon,
  InboxIcon,
  MailIcon,
  MailOpenIcon,
  PaperclipIcon,
  StarIcon,
  Trash2Icon,
} from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { GestureZone } from '@kstackz/use-gesture';
import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { useEffect, useRef } from 'react';
import type { Mail } from './data.ts';
import { Avatar } from './avatar.tsx';
import { AWAY_AT, READ_AT, type RowSwipe, useRowDrag } from './row-swipe.ts';

const COLLAPSE = { type: 'spring', visualDuration: 0.25, bounce: 0 } as const;

/**
 * One mail in the list: who, what, when, and a dot while unread. The row
 * that `swipe` moves shows what is under it: read on the left, archive and
 * delete on the right. It grows in as it arrives and collapses as it goes.
 */
export function Row(props: {
  readonly mail: Mail;
  readonly swipe: RowSwipe;
  readonly onOpen: () => void;
  readonly onArchive: (id: string) => void;
  readonly onDelete: (id: string) => void;
}) {
  const { mail, swipe } = props;
  const active = swipe.id === mail.id;
  return (
    <motion.li
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={COLLAPSE}
      className="overflow-hidden"
    >
      <div data-row={mail.id} className="relative">
        {active ? (
          <Underlay
            mail={mail}
            x={swipe.x}
            onArchive={() => swipe.away(props.onArchive)}
            onDelete={() => swipe.away(props.onDelete)}
          />
        ) : null}
        <motion.div
          className="relative bg-background"
          style={{ x: active ? swipe.x : 0 }}
          onClick={props.onOpen}
        >
          <Summary mail={mail} />
          {active && swipe.open ? <OpenRow swipe={swipe} /> : null}
        </motion.div>
      </div>
    </motion.li>
  );
}

/** What a row says: the sender, the time, the subject and a preview. */
function Summary(props: { readonly mail: Mail }) {
  const { mail } = props;
  return (
    <div className="relative flex gap-3 border-b border-border py-3 pr-4 pl-5">
      {mail.unread ? (
        <span className="absolute top-[1.45rem] left-1.5 size-2 rounded-full bg-sky-500" />
      ) : null}
      <Avatar name={mail.from} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'truncate text-[15px]',
              mail.unread ? 'font-semibold' : 'font-medium',
            )}
          >
            {mail.from}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            {mail.attachment === undefined ? null : (
              <PaperclipIcon aria-label="Attachment" className="size-3.5" />
            )}
            {mail.starred ? (
              <StarIcon
                aria-label="Starred"
                className="size-3.5 fill-amber-400 text-amber-400"
              />
            ) : null}
            {mail.time}
          </span>
        </div>
        <p
          className={cn(
            'truncate text-sm',
            mail.unread ? 'font-medium' : 'text-foreground/90',
          )}
        >
          {mail.subject}
        </p>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {mail.body.split('\n\n')[0]}
        </p>
      </div>
      <button type="button" className="sr-only">
        Open
      </button>
    </div>
  );
}

/**
 * What a moving row uncovers: read or unread on its left, and archive and
 * delete on its right. Past AWAY_AT, archive takes the whole width: letting
 * go archives.
 */
function Underlay(props: {
  readonly mail: Mail;
  readonly x: MotionValue<number>;
  readonly onArchive: () => void;
  readonly onDelete: () => void;
}) {
  const { mail, x } = props;
  const ref = useRef<HTMLDivElement>(null);
  const shown = useTransform(x, (v) => Math.max(0, -v));
  const readWidth = useTransform(x, (v) => Math.max(0, v));
  const readScale = useTransform(x, [READ_AT - 16, READ_AT], [0.8, 1]);
  const readOpacity = useTransform(x, [16, READ_AT], [0.4, 1]);
  // 1 while letting go would archive: delete gives its half to archive.
  // -1 once delete was tapped: it takes the whole width as the row leaves.
  const going = useMotionValue(0);
  const target = useRef(0);
  const goTo = (next: number) => {
    if (next === target.current) return;
    target.current = next;
    animate(going, next, COLLAPSE);
  };
  const deleteWidth = useTransform(
    [shown, going],
    ([s = 0, g = 0]: Array<number>) => (s / 2) * (1 - g),
  );
  useEffect(() =>
    x.on('change', (v) => {
      if (target.current === -1) return;
      const width = ref.current?.offsetWidth ?? Infinity;
      goTo(-v >= width * AWAY_AT ? 1 : 0);
    }),
  );
  const archived = mail.folder === 'archive';
  const ArchiveGlyph = archived ? InboxIcon : ArchiveIcon;
  const ReadGlyph = mail.unread ? MailOpenIcon : MailIcon;

  return (
    <div ref={ref} className="absolute inset-0">
      <motion.div
        className="absolute inset-y-0 left-0 flex items-center overflow-hidden bg-sky-500 pl-6 text-white"
        style={{ width: readWidth }}
      >
        <motion.span style={{ scale: readScale, opacity: readOpacity }}>
          <ReadGlyph aria-hidden="true" className="size-5" />
        </motion.span>
      </motion.div>
      <motion.div
        className="absolute inset-y-0 right-0 flex overflow-hidden text-white"
        style={{ width: shown, minWidth: 0 }}
      >
        <motion.button
          type="button"
          className="flex h-full shrink-0 flex-col items-center justify-center gap-1 overflow-hidden bg-destructive text-xs font-medium"
          style={{ width: deleteWidth }}
          onClick={(event) => {
            event.stopPropagation();
            goTo(-1);
            props.onDelete();
          }}
        >
          <Trash2Icon aria-hidden="true" className="size-5" />
          {mail.folder === 'trash' ? 'Delete' : 'Trash'}
        </motion.button>
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden bg-emerald-600 text-xs font-medium"
          onClick={(event) => {
            event.stopPropagation();
            props.onArchive();
          }}
        >
          <ArchiveGlyph aria-hidden="true" className="size-5" />
          {archived ? 'Inbox' : 'Archive'}
        </button>
      </motion.div>
    </div>
  );
}

/**
 * Over an open row: a trapped zone, so its touches reach nothing else. A
 * Swipe moves it either way; a tap shuts it.
 */
function OpenRow(props: { readonly swipe: RowSwipe }) {
  const { swipe } = props;
  return (
    <GestureZone
      trapped
      className="absolute inset-0"
      onClick={(event) => {
        event.stopPropagation();
        swipe.close();
      }}
    >
      <OpenRowDrag swipe={swipe} />
    </GestureZone>
  );
}

function OpenRowDrag(props: { readonly swipe: RowSwipe }) {
  useRowDrag(props.swipe, { enabled: true, pick: () => props.swipe.grip() });
  return null;
}
