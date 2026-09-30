import { ChevronLeftIcon, PhoneIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone } from '@kstackz/use-gesture';
import { type SwipeRelease, useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  AnimatePresence,
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from './avatar.tsx';
import { Composer } from './composer.tsx';
import type { Chat, Message as Data, Quote } from './data.ts';
import { BACK_EDGE, Message } from './message.tsx';
import { type Anchor, Reactions } from './reactions.tsx';
import { dayOf, sameDay } from './time.ts';

/** How far the thread slides left to show every message's time. */
const TIMES = 64;
const SPRING = { type: 'spring', visualDuration: 0.25, bounce: 0 } as const;

/** What the thread asks of the app. */
export interface ThreadActions {
  /** Slide the thread away, carrying a Swipe's velocity. */
  readonly onClose: (velocity?: number) => void;
  /** Slide it back in place after a Swipe that fell short. */
  readonly onStay: (velocity?: number) => void;
  readonly onSend: (text: string, replyTo: Quote | undefined) => void;
  readonly onReact: (message: string, reaction: string | undefined) => void;
}

/**
 * One open chat, sliding over the list from the right, in its own trapped
 * zone. `x` is its offset: the app slides it in and out, a Swipe right from
 * the left edge drags it.
 */
export function Thread(
  props: ThreadActions & {
    readonly chat: Chat;
    readonly x: MotionValue<number>;
  },
) {
  return (
    <motion.div
      className="absolute inset-0 z-20 shadow-[-12px_0_32px_rgb(0_0_0/0.12)]"
      style={{ x: props.x }}
    >
      <GestureZone
        trapped
        className="absolute inset-0 flex flex-col bg-background"
      >
        <Body {...props} />
      </GestureZone>
    </motion.div>
  );
}

function Body(
  props: ThreadActions & {
    readonly chat: Chat;
    readonly x: MotionValue<number>;
  },
) {
  const { chat } = props;
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [reply, setReply] = useState<Quote | undefined>(undefined);
  const [reacting, setReacting] = useState<
    { readonly id: string; readonly anchor: Anchor } | undefined
  >(undefined);
  // Read by gestures as they start, before React catches up.
  const reactingNow = useRef(false);
  const react = (next: typeof reacting) => {
    reactingNow.current = next !== undefined;
    setReacting(next);
  };

  // Back: a Swipe right from the left edge drags the thread off.
  const backing = useRef(false);
  const settleBack = (at?: SwipeRelease) => {
    if (!backing.current) return;
    backing.current = false;
    const width = root.current?.clientWidth ?? innerWidth;
    if (at !== undefined && (at.projected > width / 2 || at.velocity > 800)) {
      props.onClose(at.velocity);
    } else {
      props.onStay(at?.velocity ?? 0);
    }
  };
  const back = useSwipe({
    direction: 'right',
    from: { edge: 'left', within: BACK_EDGE },
    onStart: () => {
      props.x.stop();
      backing.current = true;
    },
    onCommit: settleBack,
    onCancel: (_reason, at) => settleBack(at),
  });
  useMotionValueEvent(back.offset, 'change', (offset) => {
    if (backing.current) props.x.set(offset);
  });

  // Times: a Swipe left slides every message over, and springs back on release.
  const reveal = useMotionValue(0);
  const shift = useTransform(reveal, (value) => -value);
  const revealing = useRef(false);
  const hide = () => {
    revealing.current = false;
    animate(reveal, 0, SPRING);
  };
  const times = useSwipe({
    direction: 'left',
    onStart: () => {
      revealing.current = !reactingNow.current;
    },
    onCommit: hide,
    onCancel: hide,
  });
  useMotionValueEvent(times.offset, 'change', (offset) => {
    if (!revealing.current) return;
    reveal.set(offset > TIMES ? TIMES + (offset - TIMES) / 4 : offset);
  });

  // Opens at the newest message, and follows each new one down.
  const count = chat.messages.length;
  const seen = useRef(0);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: seen.current === 0 ? 'instant' : 'smooth',
    });
    seen.current = count;
  }, [count]);

  const hold = (message: Data) => (element: HTMLElement) => {
    const frame = root.current?.getBoundingClientRect();
    if (frame === undefined) return;
    const rect = element.getBoundingClientRect();
    react({
      id: message.id,
      anchor: {
        top: rect.top - frame.top,
        bottom: rect.bottom - frame.top,
        left: rect.left - frame.left,
        right: frame.right - rect.right,
        side: message.side,
      },
    });
  };

  const current = chat.messages.find((m) => m.id === reacting?.id);
  const authors = [
    ...new Set(
      chat.messages.flatMap((m) => (m.author === undefined ? [] : [m.author])),
    ),
  ];

  return (
    <div ref={root} className="absolute inset-0 flex flex-col">
      <header className="z-10 flex shrink-0 items-center gap-2 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))] backdrop-blur">
        <div className="flex h-14 w-full items-center gap-2">
          <button
            type="button"
            aria-label="Chats"
            className="flex size-11 items-center justify-center rounded-full text-primary active:bg-muted"
            onClick={() => props.onClose()}
          >
            <ChevronLeftIcon className="size-6" aria-hidden="true" />
          </button>
          <Avatar chat={chat} size={36} />
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-semibold">{chat.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {chat.group
                ? `You, ${authors.join(', ')}`
                : chat.online
                  ? 'online'
                  : 'last seen recently'}
            </span>
          </div>
          {chat.group ? null : (
            <button
              type="button"
              aria-label="Call"
              className="flex size-11 items-center justify-center rounded-full text-primary active:bg-muted"
            >
              <PhoneIcon className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        // While reactions are open, a moving finger is the zone's, not a scroll.
        data-zone-gesture={reacting === undefined ? undefined : 'enabled'}
        onScroll={() => reactingNow.current && react(undefined)}
      >
        <motion.div
          className="flex min-h-full flex-col justify-end pt-3 pr-[env(safe-area-inset-right)] pb-2 pl-[env(safe-area-inset-left)]"
          style={{ x: shift }}
        >
          {chat.messages.map((message, i) => {
            const prev = chat.messages[i - 1];
            const next = chat.messages[i + 1];
            const newDay = prev === undefined || !sameDay(prev.at, message.at);
            const run = (other: Data | undefined) =>
              other !== undefined &&
              other.side === message.side &&
              other.author === message.author &&
              sameDay(other.at, message.at);
            return (
              <Fragment key={message.id}>
                {newDay ? (
                  <span className="py-3 text-center text-xs font-medium text-muted-foreground">
                    {dayOf(message.at)}
                  </span>
                ) : null}
                <Message
                  message={message}
                  showAuthor={chat.group && !run(prev)}
                  last={!run(next)}
                  reacting={() => reactingNow.current}
                  onReply={() => {
                    setReply({
                      author:
                        message.side === 'me'
                          ? 'You'
                          : (message.author ?? chat.name),
                      text: message.text,
                    });
                    input.current?.focus();
                  }}
                  onHold={hold(message)}
                />
              </Fragment>
            );
          })}
        </motion.div>
      </div>
      <Composer
        reply={reply}
        inputRef={input}
        onCancelReply={() => setReply(undefined)}
        onSend={(text) => {
          props.onSend(text, reply);
          setReply(undefined);
        }}
      />
      <AnimatePresence>
        {reacting === undefined ? null : (
          <Reactions
            key={reacting.id}
            anchor={reacting.anchor}
            current={current?.reaction}
            onClose={() => react(undefined)}
            onPick={(reaction) => {
              props.onReact(reacting.id, reaction);
              react(undefined);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
