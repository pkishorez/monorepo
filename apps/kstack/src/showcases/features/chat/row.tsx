import {
  BellOffIcon,
  MailIcon,
  MailOpenIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from '@kstackz/ui-toolkit/lucide';
import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { useEffect, useRef } from 'react';
import { Avatar } from './avatar.tsx';
import { type Chat, lastOf } from './data.ts';
import { whenOf } from './time.ts';

/** How far a row opens to show Pin and Delete. */
const ACTIONS = 160;
/** How far a row travels right before letting go toggles unread. */
const UNREAD = 88;
const SPRING = { type: 'spring', visualDuration: 0.22, bounce: 0 } as const;

// Past a limit the row follows at a third of the finger.
const resist = (value: number, min: number, max: number) =>
  value > max
    ? max + (value - max) / 3
    : value < min
      ? min + (value - min) / 3
      : value;

const isRead = (chat: Chat) => chat.unread === 0 && !chat.markedUnread;

interface Drag {
  readonly finger: Pointer;
  readonly base: number;
  axis?: 'x' | 'y';
  readonly off: () => void;
}

/**
 * One chat in the list. A finger that lands on it and goes sideways moves
 * it: left opens Pin and Delete, right past a threshold toggles unread. It
 * listens in the list's zone and keeps only touches that start on it, so the
 * list still scrolls when the finger goes up or down.
 */
export function Row(props: {
  readonly chat: Chat;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: () => void;
  readonly onPin: () => void;
  readonly onDelete: () => void;
  readonly onToggleUnread: () => void;
}) {
  const { chat, open } = props;
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const drag = useRef<Drag | undefined>(undefined);
  const iconScale = useMotionValue(1);
  const unreadOpacity = useTransform(x, [0, 24], [0, 1]);
  const actionsOpacity = useTransform(x, [-24, 0], [1, 0]);
  const last = lastOf(chat);

  const settle = (to: number, velocity = 0) =>
    animate(x, to, { ...SPRING, velocity });

  // Shut from outside, such as another row taking the touch.
  useEffect(() => {
    if (!open && drag.current === undefined && x.get() !== 0) settle(0);
  });

  // A little snap as the unread threshold is crossed.
  useMotionValueEvent(x, 'change', (value) => {
    if (drag.current === undefined) return;
    const armed = value >= UNREAD;
    if (armed === iconScale.get() > 1) return;
    animate(iconScale, armed ? 1.25 : 1, SPRING);
    if (armed) navigator.vibrate?.(8);
  });

  useGesture({
    directions: ['left', 'right'],
    onStart: (pointers) => {
      const [finger] = pointers.values();
      if (finger === undefined || !ref.current?.contains(finger.target)) return;
      x.stop();
      const follow = () => {
        const current = drag.current;
        if (current === undefined) return;
        const dx = finger.dx.get();
        if (current.axis === 'x')
          x.set(resist(current.base + dx, -ACTIONS, UNREAD));
      };
      const offX = finger.dx.on('change', follow);
      const offY = finger.dy.on('change', follow);
      drag.current = {
        finger,
        base: x.get(),
        off: () => {
          offX();
          offY();
        },
      };
    },
    // The row picks the axis the touch first moved along.
    onDirection: (direction) => {
      const current = drag.current;
      if (current === undefined) return;
      current.axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
    },
    onEnd: (_pointers, end) => {
      const current = drag.current;
      if (current === undefined) return;
      current.off();
      drag.current = undefined;
      // Up or down, or a tap: the list's, or a click.
      if (current.axis !== 'x') return;
      end.preventClick();
      const at = x.get();
      const velocity = current.finger.dx.getVelocity();
      if (end.interrupted) {
        settle(open ? -ACTIONS : 0);
        return;
      }
      if (at > 0) {
        if (at >= UNREAD) props.onToggleUnread();
        settle(0, velocity);
        if (open) props.onOpenChange(false);
        return;
      }
      const opens = at + velocity * 0.15 < -ACTIONS / 2;
      settle(opens ? -ACTIONS : 0, velocity);
      if (opens !== open) props.onOpenChange(opens);
    },
  });

  return (
    <div ref={ref} data-chat={chat.id} className="relative overflow-hidden">
      <motion.div
        className="absolute inset-y-0 left-0 flex w-full items-center bg-primary pl-6 text-primary-foreground"
        style={{ opacity: unreadOpacity }}
      >
        <motion.span
          className="flex flex-col items-center gap-1 text-xs font-medium"
          style={{ scale: iconScale }}
        >
          {isRead(chat) ? (
            <MailIcon className="size-5" aria-hidden="true" />
          ) : (
            <MailOpenIcon className="size-5" aria-hidden="true" />
          )}
          {isRead(chat) ? 'Unread' : 'Read'}
        </motion.span>
      </motion.div>
      <motion.div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: ACTIONS, opacity: actionsOpacity }}
      >
        <button
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-amber-500 text-xs font-medium text-white"
          onClick={props.onPin}
        >
          {chat.pinned ? (
            <PinOffIcon className="size-5" aria-hidden="true" />
          ) : (
            <PinIcon className="size-5" aria-hidden="true" />
          )}
          {chat.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-destructive text-xs font-medium text-white"
          onClick={props.onDelete}
        >
          <Trash2Icon className="size-5" aria-hidden="true" />
          Delete
        </button>
      </motion.div>
      <motion.button
        type="button"
        className="relative flex w-full items-center gap-3 bg-background py-2.5 pr-4 pl-5 text-left active:bg-muted"
        style={{ x }}
        onClick={() => (open ? props.onOpenChange(false) : props.onSelect())}
      >
        <Avatar chat={chat} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 self-stretch border-b border-border pb-2.5">
          <span className="flex items-baseline gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1 font-semibold">
              <span className="truncate">{chat.name}</span>
              {chat.muted ? (
                <BellOffIcon
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-label="Muted"
                />
              ) : null}
            </span>
            {last === undefined ? null : (
              <span
                className={
                  isRead(chat)
                    ? 'shrink-0 text-xs text-muted-foreground tabular-nums'
                    : 'shrink-0 text-xs text-primary tabular-nums'
                }
              >
                {whenOf(last.at)}
              </span>
            )}
          </span>
          <span className="flex items-start gap-2">
            <span className="line-clamp-2 min-h-[2lh] flex-1 text-sm text-muted-foreground">
              {last?.side === 'me'
                ? 'You: '
                : last?.author
                  ? `${last.author}: `
                  : ''}
              {last?.text}
            </span>
            <span className="flex shrink-0 items-center gap-1 pt-0.5">
              {chat.pinned && isRead(chat) ? (
                <PinIcon
                  className="size-3.5 rotate-45 text-muted-foreground"
                  aria-label="Pinned"
                />
              ) : null}
              {chat.unread > 0 ? (
                <span
                  className={
                    chat.muted
                      ? 'min-w-5 rounded-full bg-muted-foreground/40 px-1.5 text-center text-xs leading-5 font-medium text-background tabular-nums'
                      : 'min-w-5 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-medium text-primary-foreground tabular-nums'
                  }
                >
                  {chat.unread}
                </span>
              ) : chat.markedUnread ? (
                <span
                  className="mt-1 size-3 rounded-full bg-primary"
                  aria-label="Unread"
                />
              ) : null}
            </span>
          </span>
        </span>
      </motion.button>
    </div>
  );
}
