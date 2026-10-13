import { createContext, use } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/** The curve every screen moves on. */
export const EASE = [0.32, 0.72, 0, 1] as const;

/** A past Step is shown, as the devtools Time Travel: nothing can be Sent from it. */
export const PastContext = createContext(false);

/** A button that Sends: off while a past Step is shown, or while busy. */
export function Button({
  onClick,
  tone = 'quiet',
  disabled,
  label,
  busy = false,
  busyLabel,
  className = '',
  children,
}: {
  readonly onClick: () => void;
  readonly tone?: 'primary' | 'quiet' | 'icon';
  readonly disabled?: boolean;
  /** What an icon button does, for those who cannot see it. */
  readonly label?: string;
  /** Its errand is running: it says `busyLabel` and cannot be pressed. */
  readonly busy?: boolean;
  /**
   * What it says while busy. The button is as wide as its words: going busy,
   * its background grows or shrinks to the new words as they cross-fade in.
   */
  readonly busyLabel?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const past = use(PastContext);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || past || busy}
      aria-label={label}
      aria-busy={busy || undefined}
      title={label}
      // The background follows the words' size; Motion keeps the words and
      // the corners from stretching as it does.
      layout
      whileTap={{ scale: 0.97 }}
      transition={{
        layout: { duration: 0.3, ease: EASE },
        scale: { duration: 0.15, ease: 'easeOut' },
      }}
      style={{ borderRadius: 8 }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden text-[13px] font-medium whitespace-nowrap transition-[background-color,color,opacity] duration-200 ease-out outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none ${
        busy ? '' : 'disabled:opacity-40'
      } ${
        tone === 'primary'
          ? `h-9 px-4 ${
              // Busy, it is a status, not a button: no background, quiet words.
              busy
                ? 'bg-transparent text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`
          : tone === 'icon'
            ? 'size-8 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4'
            : `h-8 px-3 ${
                busy
                  ? 'text-muted-foreground/80'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
      } ${className}`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={busy ? 'busy' : 'idle'}
          layout="position"
          initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
          transition={{ duration: 0.22, ease: EASE }}
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          {busy ? (
            <>
              <Spinner /> {busyLabel}
            </>
          ) : (
            children
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

export function Spinner({ className = '' }: { readonly className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none ${className}`}
    />
  );
}

/** A Time, in milliseconds since the app started, as minutes and seconds. */
export function Clock({ at }: { readonly at: number }) {
  const seconds = Math.floor(at / 1000);
  return (
    <span className="tabular-nums">
      {Math.floor(seconds / 60)}:{`${seconds % 60}`.padStart(2, '0')}
    </span>
  );
}
