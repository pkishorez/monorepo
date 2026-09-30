import { ReplyIcon } from '@kstackz/ui-toolkit/lucide';
import { useGesture } from '@kstackz/use-gesture/core';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { useRef } from 'react';
import type { Message as Data } from './data.ts';
import { timeOf } from './time.ts';

/** How far a message travels right before letting go replies to it. */
const REPLY = 64;
/** Touches that land this close to the left edge are the back Swipe's. */
export const BACK_EDGE = 24;
/** How long a finger holds still on a message to react to it. */
const HOLD_MS = 400;
/** How far a holding finger may drift. */
const HOLD_SLOP = 8;
const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

// Past REPLY the bubble follows at a quarter of the finger.
const resist = (offset: number) =>
  offset > REPLY ? REPLY + (offset - REPLY) / 4 : offset;

/**
 * One message. It listens in the thread's zone and keeps only touches that
 * land on it: a Swipe right replies once it passes REPLY, with a snap as it
 * does; a finger held still for HOLD_MS asks for reactions. Its time sits
 * just past the right edge, shown when the thread slides left.
 */
export function Message(props: {
  readonly message: Data;
  /** Show who wrote it, as the first of a run in a group. */
  readonly showAuthor: boolean;
  /** The last of a run from one side: its bubble gets the tail corner. */
  readonly last: boolean;
  /** Whether reactions are open, which stops every swipe. */
  readonly reacting: () => boolean;
  readonly onReply: () => void;
  readonly onHold: (element: HTMLElement) => void;
}) {
  const { message } = props;
  const mine = message.side === 'me';
  const ref = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const iconScale = useMotionValue(1);
  const iconOpacity = useTransform(x, [16, REPLY], [0, 1]);
  // Whether the Gesture under way is this message's, and whether it held.
  const own = useRef(false);
  const held = useRef(false);
  const stopHold = useRef<() => void>(() => {});

  useGesture({
    onStart: (pointers) => {
      const [finger] = pointers.values();
      own.current =
        finger !== undefined &&
        finger.start.x > BACK_EDGE &&
        ref.current?.contains(finger.target) === true &&
        !props.reacting();
      held.current = false;
      if (!own.current || finger === undefined) return;
      const timer = setTimeout(() => {
        held.current = true;
        navigator.vibrate?.(10);
        if (bubble.current !== null) props.onHold(bubble.current);
      }, HOLD_MS);
      const drift = () => {
        if (Math.hypot(finger.dx.get(), finger.dy.get()) > HOLD_SLOP) {
          clearTimeout(timer);
        }
      };
      const offX = finger.dx.on('change', drift);
      const offY = finger.dy.on('change', drift);
      stopHold.current = () => {
        clearTimeout(timer);
        offX();
        offY();
      };
    },
    // A finger lifting, or a second one landing, is not a hold.
    onPointer: (pointer, pointers) => {
      if (pointer.end !== undefined || pointers.size > 1) stopHold.current();
    },
    onEnd: (_pointers, end) => {
      stopHold.current();
      stopHold.current = () => {};
      if (held.current) end.preventClick();
    },
  });

  const back = () => animate(x, 0, SPRING);
  const swipe = useSwipe({
    direction: 'right',
    commit: { distance: REPLY },
    onStart: () => {
      if (held.current) own.current = false;
    },
    onCommit: () => {
      if (!own.current) return;
      back();
      props.onReply();
    },
    onCancel: () => {
      if (own.current) back();
    },
  });
  useMotionValueEvent(swipe.offset, 'change', (offset) => {
    if (own.current && !held.current) x.set(resist(offset));
  });
  useMotionValueEvent(swipe.willCommit, 'change', (armed) => {
    if (!own.current || held.current) return;
    animate(iconScale, armed ? 1.2 : 1, SPRING);
    if (armed) navigator.vibrate?.(8);
  });

  return (
    <div
      ref={ref}
      className={
        props.last
          ? 'relative flex flex-col px-3 pb-2'
          : 'relative flex flex-col px-3 pb-0.5'
      }
    >
      {props.showAuthor && message.author !== undefined ? (
        <span className="px-3 pb-0.5 text-xs font-medium text-muted-foreground">
          {message.author}
        </span>
      ) : null}
      <motion.div
        className="pointer-events-none absolute top-1/2 left-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground"
        style={{ opacity: iconOpacity, scale: iconScale }}
      >
        <ReplyIcon className="size-4" aria-hidden="true" />
      </motion.div>
      <motion.div
        className={mine ? 'flex justify-end' : 'flex justify-start'}
        style={{ x }}
      >
        <div
          ref={bubble}
          className={[
            'relative max-w-[min(78%,28rem)] rounded-[1.25rem] px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap',
            mine
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground',
            props.last ? (mine ? 'rounded-br-md' : 'rounded-bl-md') : '',
            message.reaction === undefined ? '' : 'mb-3',
          ].join(' ')}
        >
          {message.replyTo === undefined ? null : (
            <span
              className={
                mine
                  ? 'mb-1 flex flex-col border-l-2 border-primary-foreground/50 pl-2 text-[13px] opacity-80'
                  : 'mb-1 flex flex-col border-l-2 border-primary pl-2 text-[13px] opacity-80'
              }
            >
              <span className="font-medium">{message.replyTo.author}</span>
              <span className="line-clamp-2">{message.replyTo.text}</span>
            </span>
          )}
          {message.text}
          {message.reaction === undefined ? null : (
            <span
              className={
                mine
                  ? 'absolute -bottom-3.5 left-1 rounded-full bg-card px-1.5 py-0.5 text-sm leading-none shadow-sm ring-1 ring-edge'
                  : 'absolute right-1 -bottom-3.5 rounded-full bg-card px-1.5 py-0.5 text-sm leading-none shadow-sm ring-1 ring-edge'
              }
            >
              {message.reaction}
            </span>
          )}
        </div>
      </motion.div>
      <span className="absolute top-1/2 left-full w-16 -translate-y-1/2 pl-2 text-xs text-muted-foreground tabular-nums">
        {timeOf(message.at)}
      </span>
    </div>
  );
}
