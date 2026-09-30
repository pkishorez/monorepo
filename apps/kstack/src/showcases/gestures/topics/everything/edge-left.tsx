import {
  ArchiveIcon,
  ArrowDownIcon,
  InboxIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MenuIcon,
  SendIcon,
  SettingsIcon,
  StarIcon,
  Trash2Icon,
  UserIcon,
} from '@kstackz/ui-toolkit/lucide';
import {
  GestureZone,
  usePullToRefresh,
  useSidebar,
} from '@kstackz/use-gesture';
import { useGesture } from '@kstackz/use-gesture/core';
import { type SwipeRelease, useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SIDEBAR = 280;
/** The strip along each side of the screen that each sidebar opens from. */
const EDGE = 24;
const ACTIONS = 144;
const DISTANCE = 72;
const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

type Mail = {
  readonly id: number;
  readonly from: string;
  readonly subject: string;
};

const PEOPLE = [
  'Maya Chen',
  'Leo Park',
  'Ana Ruiz',
  'Sam Okafor',
  'Iris Novak',
  'Stripe',
  'GitHub',
];
const SUBJECTS = [
  'Design review moved to Thursday',
  'Re: the onboarding copy',
  'Photos from Saturday',
  'Your payout is on its way',
  '3 new comments on #482',
  'Quick question about the API',
  'Lunch next week?',
];
const mail = (id: number): Mail => ({
  id,
  from: PEOPLE[id % PEOPLE.length]!,
  subject: SUBJECTS[(id * 3) % SUBJECTS.length]!,
});

const PINNED = [
  { title: 'Q3 planning', detail: '4 files · Maya' },
  { title: 'Flight to Lisbon', detail: 'Fri 08:40 · TP 1351' },
  { title: 'Offsite agenda', detail: 'Shared by Leo' },
  { title: 'Invoice #2291', detail: 'Due in 5 days' },
];

const MAILBOXES = [
  { label: 'Inbox', icon: InboxIcon },
  { label: 'Starred', icon: StarIcon },
  { label: 'Sent', icon: SendIcon },
  { label: 'Archive', icon: ArchiveIcon },
  { label: 'Trash', icon: Trash2Icon },
];

const initials = (name: string) =>
  name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2);

/**
 * The same inbox, with the menu opening only from the left edge. A Swipe
 * right anywhere else is left to the rows and the carousel.
 *
 * The screen is the outer zone, with both sidebars. The feed is a zone
 * inside it with the pull, the rows and the scrolling. Each sidebar waits
 * while the other is open, and the menu and the pull wait while a row is.
 */
export function EdgeLeft() {
  const [panel, setPanel] = useState<'menu' | 'account'>();
  const [openRow, setOpenRow] = useState<number>();
  const menu = useSidebar({
    side: 'left',
    width: SIDEBAR,
    edge: EDGE,
    open: panel === 'menu',
    onOpenChange: (open) =>
      setPanel((p) => (open ? 'menu' : p === 'menu' ? undefined : p)),
    enabled: panel !== 'account' && openRow === undefined,
  });
  const account = useSidebar({
    side: 'right',
    width: SIDEBAR,
    edge: EDGE,
    open: panel === 'account',
    onOpenChange: (open) =>
      setPanel((p) => (open ? 'account' : p === 'account' ? undefined : p)),
    enabled: panel !== 'menu',
  });
  const scrim = useTransform(() =>
    Math.max(menu.progress.get(), account.progress.get()),
  );

  return (
    <>
      <div className="absolute inset-0 flex flex-col">
        <header className="z-10 shrink-0 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-1 px-2">
            <button
              type="button"
              aria-label="Menu"
              className="grid size-11 place-items-center rounded-full"
              onClick={() => menu.setOpen(true)}
            >
              <MenuIcon className="size-5" aria-hidden="true" />
            </button>
            <h1 className="flex-1 text-base font-semibold">Inbox</h1>
            <button
              type="button"
              aria-label="Account"
              className="grid size-11 place-items-center"
              onClick={() => account.setOpen(true)}
            >
              <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                AM
              </span>
            </button>
          </div>
        </header>
        <GestureZone className="relative min-h-0 flex-1">
          <Feed
            openRow={openRow}
            onOpenRowChange={setOpenRow}
            sidebarStatus={
              menu.dragging
                ? 'The menu has the touch'
                : account.dragging
                  ? 'The account panel has the touch'
                  : panel === 'menu'
                    ? 'Menu open'
                    : panel === 'account'
                      ? 'Account open'
                      : undefined
            }
          />
        </GestureZone>
      </div>
      <motion.div
        className="absolute inset-0 z-20 bg-black/40"
        style={{ opacity: scrim, pointerEvents: panel ? 'auto' : 'none' }}
        onClick={() => (panel === 'menu' ? menu : account).setOpen(false)}
      />
      <motion.aside
        className="absolute inset-y-0 left-0 z-30 flex flex-col gap-1 bg-sidebar p-3 pt-[max(1rem,env(safe-area-inset-top))] text-sm shadow-xl"
        style={{ width: SIDEBAR, x: menu.x }}
      >
        <span className="px-3 pb-2 font-semibold">Mail</span>
        {MAILBOXES.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            className={`flex h-10 items-center gap-3 rounded-md px-3 ${label === 'Inbox' ? 'bg-sidebar-accent font-medium' : ''}`}
            onClick={() => menu.setOpen(false)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </motion.aside>
      <motion.aside
        className="absolute inset-y-0 right-0 z-30 flex flex-col gap-1 bg-sidebar p-3 pt-[max(1rem,env(safe-area-inset-top))] text-sm shadow-xl"
        style={{ width: SIDEBAR, x: account.x }}
      >
        <div className="flex items-center gap-3 px-3 pb-4">
          <span className="grid size-10 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            AM
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">Alex Morgan</span>
            <span className="truncate text-xs text-muted-foreground">
              alex@example.com
            </span>
          </span>
        </div>
        {[
          { label: 'Profile', icon: UserIcon },
          { label: 'Settings', icon: SettingsIcon },
          { label: 'Sign out', icon: LogOutIcon },
        ].map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            className="flex h-10 items-center gap-3 rounded-md px-3"
            onClick={() => account.setOpen(false)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </motion.aside>
    </>
  );
}

/**
 * The feed, inside its own zone: a list that scrolls and pulls to refresh,
 * with a carousel of pinned cards and rows that swipe open.
 */
function Feed(props: {
  readonly openRow: number | undefined;
  readonly onOpenRowChange: (row: number | undefined) => void;
  readonly sidebarStatus: string | undefined;
}) {
  const { openRow, onOpenRowChange } = props;
  const [mails, setMails] = useState(() =>
    Array.from({ length: 20 }, (_, i) => mail(20 - i)),
  );
  const pull = usePullToRefresh({
    distance: DISTANCE,
    enabled: openRow === undefined,
    onRefresh: async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      setMails((mails) => {
        const top = mails[0]?.id ?? 0;
        return [mail(top + 2), mail(top + 1), ...mails];
      });
    },
  });
  const rotate = useTransform(pull.progress, [0.8, 1], [0, 180]);
  const [scrolling, setScrolling] = useState<'list' | 'carousel'>();
  useStageStatus(
    props.sidebarStatus ??
      (pull.state === 'refreshing'
        ? 'Refreshing'
        : pull.state === 'armed'
          ? 'Let go to refresh'
          : pull.state === 'pulling'
            ? 'The pull has the touch'
            : scrolling === 'carousel'
              ? 'The carousel has the touch'
              : scrolling === 'list'
                ? 'The list has the touch'
                : openRow !== undefined
                  ? 'Row open'
                  : undefined),
  );

  return (
    <div
      className="relative h-full overflow-y-auto"
      onScroll={() => setScrolling('list')}
      onScrollEnd={() => setScrolling(undefined)}
    >
      <motion.div
        className="absolute inset-x-0 top-0 flex items-center justify-center"
        style={{ height: DISTANCE, opacity: pull.progress }}
      >
        <motion.div
          className="grid size-8 place-items-center rounded-full bg-muted"
          style={{ rotate: pull.state === 'refreshing' ? 0 : rotate }}
        >
          {pull.state === 'refreshing' ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <ArrowDownIcon className="size-4" />
          )}
        </motion.div>
      </motion.div>
      <motion.div
        className="relative bg-background pb-[calc(6rem+env(safe-area-inset-bottom))]"
        style={{ y: pull.y }}
      >
        <p className="px-4 pt-4 text-xs font-medium text-muted-foreground">
          Pinned
        </p>
        <div
          className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-3 [scrollbar-width:none]"
          onScroll={(event) => {
            event.stopPropagation();
            setScrolling('carousel');
          }}
          onScrollEnd={(event) => {
            event.stopPropagation();
            setScrolling(undefined);
          }}
        >
          {PINNED.map((card) => (
            <div
              key={card.title}
              className="flex h-24 w-56 shrink-0 snap-start flex-col justify-end rounded-xl bg-muted p-3"
            >
              <span className="text-sm font-medium">{card.title}</span>
              <span className="text-xs text-muted-foreground">
                {card.detail}
              </span>
            </div>
          ))}
        </div>
        <p className="px-4 pt-2 pb-1 text-xs font-medium text-muted-foreground">
          Recent
        </p>
        <AnimatePresence initial={false}>
          {mails.map((m) => (
            <motion.div
              key={m.id}
              className="overflow-hidden border-b border-border"
              exit={{ height: 0 }}
              transition={SPRING}
            >
              <Row
                mail={m}
                open={openRow === m.id}
                onOpenChange={(open) => {
                  if (open) onOpenRowChange(m.id);
                  else if (openRow === m.id) onOpenRowChange(undefined);
                }}
                onRemove={() => {
                  if (openRow === m.id) onOpenRowChange(undefined);
                  setMails((mails) => mails.filter((other) => other !== m));
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/**
 * One row. It hears every Gesture in the feed and moves only for one whose
 * first finger landed on it, away from the side edges, which are the
 * sidebars'. A finger landing anywhere else shuts it.
 */
function Row(props: {
  readonly mail: Mail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRemove: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const mine = useRef(false);
  const grabbed = useRef<number | undefined>(undefined);
  const target = useRef(props.open);

  const to = (open: boolean, velocity = 0) => {
    target.current = open;
    animate(x, open ? -ACTIONS : 0, { ...SPRING, velocity });
  };
  const settle = (open: boolean, velocity = 0) => {
    grabbed.current = undefined;
    to(open, velocity);
    props.onOpenChange(open);
  };
  useEffect(() => {
    if (target.current !== props.open) to(props.open);
  });

  const grab = () => {
    if (!mine.current) return;
    x.stop();
    grabbed.current = x.get();
  };
  const release = (sign: 1 | -1) => (at?: SwipeRelease) => {
    if (grabbed.current === undefined) return;
    if (at === undefined) return settle(props.open);
    const headed = grabbed.current + sign * at.projected;
    settle(headed < -ACTIONS / 2, sign * at.velocity);
  };
  const follow = (at: number) => x.set(Math.min(0, Math.max(-ACTIONS, at)));

  useGesture({
    onStart: (pointers) => {
      const [first] = pointers.values();
      mine.current =
        first !== undefined &&
        first.start.x > EDGE &&
        first.start.x < window.innerWidth - EDGE &&
        (ref.current?.contains(first.target) ?? false);
      if (props.open && !mine.current) settle(false);
    },
  });
  const opening = useSwipe({
    enabled: !props.open,
    direction: 'left',
    onStart: grab,
    onCommit: release(-1),
    onCancel: (_reason, at) => release(-1)(at),
  });
  const closing = useSwipe({
    enabled: props.open,
    direction: 'right',
    onStart: grab,
    onCommit: release(1),
    onCancel: (_reason, at) => release(1)(at),
  });
  useMotionValueEvent(opening.offset, 'change', (offset) => {
    if (grabbed.current !== undefined) follow(grabbed.current - offset);
  });
  useMotionValueEvent(closing.offset, 'change', (offset) => {
    if (grabbed.current !== undefined) follow(grabbed.current + offset);
  });

  return (
    <div ref={ref} className="relative h-16 overflow-hidden">
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: ACTIONS }}
      >
        <button
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-primary text-xs text-primary-foreground"
          onClick={props.onRemove}
        >
          <ArchiveIcon className="size-4" aria-hidden="true" />
          Archive
        </button>
        <button
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-destructive text-xs text-white"
          onClick={props.onRemove}
        >
          <Trash2Icon className="size-4" aria-hidden="true" />
          Delete
        </button>
      </div>
      <motion.div
        className="absolute inset-0 flex items-center gap-3 bg-background px-4"
        style={{ x }}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
          {initials(props.mail.from)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">
            {props.mail.from}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {props.mail.subject}
          </span>
        </span>
      </motion.div>
    </div>
  );
}
