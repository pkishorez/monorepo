import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, type Transition } from 'motion/react';
import { cn } from 'kui-toolkit/utils';

const easeOut: Transition['ease'] = [0.23, 1, 0.32, 1];

/** Decorative level meter: calm when idle, lively while listening. */
export function Waveform({
  active,
  bars = 40,
  className,
}: {
  readonly active: boolean;
  readonly bars?: number;
  readonly className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex h-12 items-center justify-center gap-[3px]',
        className,
      )}
    >
      {Array.from({ length: bars }, (_, index) => {
        const peak =
          0.3 + 0.7 * Math.abs(Math.sin(index * 0.9) * Math.cos(index * 0.37));
        return (
          <span
            key={index}
            className={cn(
              'wave-bar h-full w-[3px] rounded-full transition-colors duration-500',
              active ? 'bg-primary' : 'bg-muted-foreground/30',
            )}
            style={
              {
                '--peak': active ? peak : 0.08 + peak * 0.18,
                '--wave-duration': `${active ? 0.9 + (index % 5) * 0.14 : 2.4}s`,
                '--wave-delay': `${-index * (active ? 0.07 : 0.11)}s`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

const demoWords = [
  'Checkout',
  'breaks',
  'right',
  'here',
  null,
  'after',
  'the',
  'card',
  'step.',
] as const;

/** A looping sentence that shows the idea: a press lands where it was said. */
function AnchorDemo() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setStep((current) => (current + 1) % (demoWords.length + 6)),
      420,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      aria-hidden
      className="flex min-h-9 flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-lg"
    >
      <AnimatePresence>
        {demoWords.map((word, index) =>
          index < step ? (
            word === null ? (
              <motion.span
                key="chip"
                className="relative inline-flex items-center rounded-md bg-primary/15 px-2 py-0.5 text-sm font-medium text-primary"
                initial={{ opacity: 0, y: -18, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', duration: 0.5, bounce: 0.35 }}
              >
                <motion.span
                  className="absolute inset-0 rounded-md ring-2 ring-primary"
                  initial={{ opacity: 0.8, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.6 }}
                  transition={{ duration: 0.7, ease: easeOut }}
                />
                This screen
              </motion.span>
            ) : (
              <motion.span
                key={word}
                className={
                  index < step - 3 ? 'text-foreground' : 'text-muted-foreground'
                }
                style={{ transition: 'color 400ms' }}
                initial={{ opacity: 0, y: 6, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ duration: 0.35, ease: easeOut }}
              >
                {word}
              </motion.span>
            )
          ) : null,
        )}
      </AnimatePresence>
    </div>
  );
}

const tagline =
  'Speak, press a context button mid-sentence, and it lands exactly where you said it.';

/** The title block: a full landing on the first screen, a slim header after. */
export function Hero({ compact }: { readonly compact: boolean }) {
  return (
    <motion.header
      layout
      transition={{ duration: 0.5, ease: easeOut }}
      className={cn(
        'flex flex-col',
        compact ? 'items-start gap-1' : 'items-center gap-6 pt-6 text-center',
      )}
    >
      <motion.h1
        layout="position"
        className={cn(
          'flex font-semibold tracking-tight',
          compact ? 'text-2xl' : 'text-7xl sm:text-8xl',
        )}
        aria-label="stt"
      >
        {['s', 't', 't'].map((letter, index) => (
          <motion.span
            key={index}
            aria-hidden
            initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{
              type: 'spring',
              duration: 0.7,
              bounce: 0.25,
              delay: 0.08 * index,
            }}
          >
            {letter}
          </motion.span>
        ))}
        <motion.span
          aria-hidden
          className="text-primary"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', bounce: 0.5, delay: 0.35 }}
        >
          .
        </motion.span>
      </motion.h1>
      <motion.p
        layout="position"
        className={cn(
          'max-w-xl text-muted-foreground text-pretty',
          compact ? 'text-sm' : 'text-base sm:text-lg',
        )}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: easeOut, delay: 0.3 }}
      >
        {tagline} {compact ? null : 'Everything runs in this tab on WebGPU.'}
      </motion.p>
      <AnimatePresence initial={false}>
        {compact ? null : (
          <motion.div
            key="demo"
            className="flex w-full flex-col items-center gap-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: easeOut }}
          >
            <Waveform active className="w-full max-w-sm" />
            <AnchorDemo />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
