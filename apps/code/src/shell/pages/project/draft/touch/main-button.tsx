import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ArrowUpIcon,
  CheckIcon,
  MicIcon,
} from '@kestack/web-platform/ui/components/lucide';
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from '@kestack/web-platform/ui/components/motion';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { GestureZone, useSwipe } from '@kestack/web-platform/ui/input';
import { useState } from 'react';

/*
 * The Touch Draft's one main button, bottom right, and the small Send over
 * it. The button dictates at rest, takes the Dictation while it records,
 * and waits while it is written out or sent. Send shows while there is
 * something to send: a tap on it sends, and so does a swipe of the button
 * up onto it. The button follows the finger, turns into Send near the
 * top, where Android buzzes once, and springs back below it. A mouse never
 * swipes it; a screen reader has Send itself. No double tap.
 */

/** From the button's centre to Send's, in px: how far a swipe goes to send. */
export const SEND_AT = 64;

/** Past this share of the way, letting go sends. */
const ARMED = 0.75;

const HOME = { type: 'spring', visualDuration: 0.3, bounce: 0.2 } as const;
const SWAP = { type: 'spring', visualDuration: 0.18, bounce: 0 } as const;

/** Where the button is drawn for a finger `offset` px up: with it to Send, then held back. */
export const follow = (offset: number) =>
  offset <= SEND_AT ? offset : SEND_AT + (offset - SEND_AT) * 0.2;

type Props = {
  /** What the button does: dictate, take the Dictation, or nothing while busy. */
  readonly does: 'dictate' | 'take' | 'busy';
  /** What Send says, while there is something to send; null hides it. */
  readonly send: string | null;
  readonly disabled: boolean;
  readonly onPress: () => void;
  /** A tap on Send, or a swipe of the button onto it. */
  readonly onSend: () => void;
};

/** The column is a Gesture Zone of its own, so its Swipe hears only it. */
export function MainButton(props: Props) {
  return (
    <GestureZone className="relative flex shrink-0 flex-col items-center gap-3">
      <Column {...props} />
    </GestureZone>
  );
}

function Column({ does, send, disabled, onPress, onSend }: Props) {
  const y = useMotionValue(0);
  const reduced = useReducedMotion() === true;
  const [armed, setArmed] = useState(false);
  const home = () => (reduced ? y.jump(0) : void animate(y, 0, HOME));
  const swipe = useSwipe({
    enabled: send !== null && !disabled,
    direction: 'up',
    commit: { distance: SEND_AT * ARMED },
    onCommit: () => {
      home();
      onSend();
    },
    onCancel: home,
  });
  useMotionValueEvent(swipe.offset, 'change', (offset) =>
    y.set(-follow(offset)),
  );
  useMotionValueEvent(swipe.willCommit, 'change', (will) => {
    setArmed(will);
    if (will) navigator.vibrate?.(8);
  });
  const label =
    does === 'take'
      ? 'Take the Dictation'
      : does === 'busy'
        ? 'Working…'
        : 'Dictate';
  const icon = armed ? 'send' : does;
  return (
    <>
      <div className="flex size-11 items-center justify-center">
        <AnimatePresence initial={false}>
          {send !== null && (
            <motion.div
              key="send"
              initial={{ opacity: 0, scale: 0.6, y: 8 }}
              animate={{ opacity: 1, scale: armed ? 1.12 : 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: 8 }}
              transition={SWAP}
            >
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={send}
                disabled={disabled}
                onClick={onSend}
                className={cn(
                  'size-11 rounded-full border border-border transition-colors duration-150 ease-out motion-reduce:transition-none [&_svg:not([class*=size-])]:size-5',
                  armed &&
                    'border-transparent bg-primary text-primary-foreground',
                )}
              >
                <ArrowUpIcon aria-hidden />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <motion.div style={{ y }} className="touch-none">
        <Button
          type="button"
          size="icon"
          aria-label={label}
          data-slot="dictate"
          disabled={disabled || does === 'busy'}
          onClick={onPress}
          className="size-15 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.08),0_6px_16px_rgb(0_0_0/0.12)] transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-100 motion-reduce:transition-none [&_svg:not([class*=size-])]:size-6"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={icon}
              initial={{ opacity: 0, scale: 0.6, filter: 'blur(2px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.6, filter: 'blur(2px)' }}
              transition={SWAP}
              className="flex"
            >
              {icon === 'send' ? (
                <ArrowUpIcon aria-hidden />
              ) : icon === 'take' ? (
                <CheckIcon aria-hidden />
              ) : icon === 'busy' ? (
                <Spinner className="size-5" />
              ) : (
                <MicIcon aria-hidden />
              )}
            </motion.span>
          </AnimatePresence>
        </Button>
      </motion.div>
    </>
  );
}
