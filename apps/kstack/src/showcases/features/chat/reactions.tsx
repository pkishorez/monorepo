import { motion } from 'motion/react';
import { REACTIONS } from './data.ts';

/** Where the held bubble sits, in px within the thread. */
export interface Anchor {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly side: 'me' | 'them';
}

const BAR = 52;

/**
 * The reactions offered for a held message, just above it (below it near
 * the top), over a scrim that shuts them on a tap.
 */
export function Reactions(props: {
  readonly anchor: Anchor;
  readonly current: string | undefined;
  readonly onPick: (reaction: string | undefined) => void;
  readonly onClose: () => void;
}) {
  const { anchor } = props;
  const above = anchor.top - BAR - 8 > 64;
  const mine = anchor.side === 'me';
  return (
    <>
      <motion.div
        className="absolute inset-0 z-20 bg-black/15"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={props.onClose}
      />
      <motion.div
        role="toolbar"
        aria-label="Reactions"
        className="absolute z-20 flex items-center gap-0.5 rounded-full bg-popover p-1 shadow-lg ring-1 ring-foreground/10"
        style={{
          top: above ? anchor.top - BAR - 8 : anchor.bottom + 8,
          height: BAR,
          ...(mine ? { right: anchor.right } : { left: anchor.left }),
          transformOrigin: `${mine ? 'right' : 'left'} ${above ? 'bottom' : 'top'}`,
        }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', visualDuration: 0.18, bounce: 0 }}
      >
        {REACTIONS.map((reaction) => (
          <button
            key={reaction}
            type="button"
            aria-label={reaction}
            aria-pressed={props.current === reaction}
            className="flex size-11 items-center justify-center rounded-full text-2xl transition-transform duration-100 active:scale-90 aria-pressed:bg-muted"
            onClick={() =>
              props.onPick(props.current === reaction ? undefined : reaction)
            }
          >
            {reaction}
          </button>
        ))}
      </motion.div>
    </>
  );
}
