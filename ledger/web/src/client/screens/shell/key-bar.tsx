import type { Binding } from '@kstackz/use-keys';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { BindingKeys } from '../../kit/keyboard/index.ts';
import { keys, useGiven } from '@ledger/core/client/commands';

// How long, in ms, a Command given stays shown, and a broken Sequence.
const GIVEN = 1400;
const BROKEN = 900;
// A Sequence that ends without a Command given within this many ms broke.
const SETTLE = 60;

const EASE = [0.23, 1, 0.32, 1] as const;

const LEAVE = {
  leave: (last: boolean) => ({
    opacity: 0,
    transition: { duration: last ? 0.15 : 0 },
  }),
};

type Shown =
  | {
      readonly kind: 'pending';
      readonly pressed: ReadonlyArray<Binding>;
      readonly next: ReadonlyArray<{
        readonly id: string;
        readonly step: Binding;
        readonly description: string;
      }>;
    }
  | { readonly kind: 'given'; readonly id: string; readonly at: number }
  | { readonly kind: 'broken'; readonly pressed: ReadonlyArray<Binding> };

/**
 * One bar at the foot of the screen, over the page so nothing beneath it
 * moves. While a Sequence is under way it shows every way to finish it; a
 * key that finishes none shakes it and it goes; a Command given, by key or
 * gesture, shows for a moment with its key, so the keys teach themselves.
 * Each replaces the last in place.
 */
export function KeyBar() {
  const { sequence, actions } = keys.useStatus();
  const given = useGiven();
  const [shown, setShown] = useState<Shown>();
  const latestGiven = useRef(given);
  latestGiven.current = given;
  const was = useRef<Shown>(undefined);

  // A Sequence under way, or ended: by a Command, or broken.
  useEffect(() => {
    if (sequence.type === 'possible') {
      const pending: Shown = {
        kind: 'pending',
        pressed: sequence.pressed,
        next: sequence.next,
      };
      was.current = pending;
      setShown(pending);
      return;
    }
    const before = was.current;
    was.current = undefined;
    if (before?.kind !== 'pending') return;
    const ended = performance.now();
    const timer = setTimeout(() => {
      const last = latestGiven.current;
      if (last !== undefined && last.at >= ended - SETTLE) return;
      setShown({ kind: 'broken', pressed: before.pressed });
    }, SETTLE);
    return () => clearTimeout(timer);
  }, [sequence]);

  useEffect(() => {
    if (given !== undefined) setShown({ kind: 'given', ...given });
  }, [given]);

  // What is shown goes after a while, unless something new replaced it.
  useEffect(() => {
    if (shown === undefined || shown.kind === 'pending') return;
    const timer = setTimeout(
      () => setShown(undefined),
      shown.kind === 'given' ? GIVEN : BROKEN,
    );
    return () => clearTimeout(timer);
  }, [shown]);

  const action =
    shown?.kind === 'given'
      ? actions.find((each) => each.id === shown.id)
      : undefined;
  const key =
    shown === undefined
      ? 'none'
      : shown.kind === 'given'
        ? `given-${shown.at}`
        : shown.kind;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-40 flex justify-center px-4 touch:bottom-[calc(env(safe-area-inset-bottom)+5.75rem)]">
      {/* A new one takes the old one's place at once, so the two never show
          together; only the last one fades as it goes. */}
      <AnimatePresence initial={false} custom={shown === undefined}>
        {shown && (shown.kind !== 'given' || action) && (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={
              shown.kind === 'broken'
                ? { opacity: 1, y: 0, scale: 1, x: [0, -6, 5, -3, 2, 0] }
                : { opacity: 1, y: 0, scale: 1, x: 0 }
            }
            custom={shown === undefined}
            variants={LEAVE}
            exit="leave"
            transition={{ duration: 0.18, ease: EASE }}
            className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md"
          >
            {shown.kind === 'pending' && (
              <>
                <Steps pressed={shown.pressed}>then</Steps>
                {shown.next.map((next) => (
                  <span key={next.id} className="flex items-center gap-1.5">
                    <BindingKeys binding={next.step} />
                    <span className="text-muted-foreground">
                      {next.description}
                    </span>
                  </span>
                ))}
              </>
            )}
            {shown.kind === 'broken' && (
              <Steps pressed={shown.pressed}>then that does nothing</Steps>
            )}
            {shown.kind === 'given' && action && (
              <>
                {action.description}
                {action.bindings[0] && (
                  <BindingKeys binding={action.bindings[0].binding} />
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Steps(props: {
  readonly pressed: ReadonlyArray<Binding>;
  readonly children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {props.pressed.map((step, i) => (
        <BindingKeys key={i} binding={step} />
      ))}
      <span className="text-muted-foreground">{props.children}</span>
    </span>
  );
}
