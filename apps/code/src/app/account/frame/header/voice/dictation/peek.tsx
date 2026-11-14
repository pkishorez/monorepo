import { useChild } from '@kestack/kabuki/react';
import type { Handle } from '@kestack/kabuki/react/types';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import type { DictationLive } from './actor.ts';

/*
 * A peek at a Dictation as it goes, for where its field does not show its
 * words, as a minimized Touch Draft: two lines at most. The words fill the
 * first line, then the second; as the second fills, both move up a line,
 * the old one going and a new one coming, the line before the newest
 * dimmed, each new word fading in. While the model downloads on its
 * Connection, one line says how far, under a note that it only happens
 * once. It floats on a veil, not a card: what is behind it blurs and
 * sinks into the page, with no edge.
 */

type Dictation = Handle<typeof DictationLive>;

/** One line, in px: the leading of the words. */
const LINE = 24;

/** The most words it draws: far more than two lines hold, so few are drawn. */
const SHOWN = 40;

/** The text, as words and the space after each, so a new word can fade in. */
const wordsOf = (text: string) => text.match(/\S+\s*/g) ?? [];

/**
 * Words in two lines at most, the newest in view: the line before them
 * dimmed, the lines before that gone up and out.
 */
export function Rolling({
  text,
  muted = false,
}: {
  readonly text: string;
  readonly muted?: boolean;
}) {
  const inner = useRef<HTMLParagraphElement>(null);
  const [lines, setLines] = useState(1);
  useLayoutEffect(() => {
    const node = inner.current;
    if (node === null) return;
    const measure = () =>
      setLines(Math.max(1, Math.round(node.offsetHeight / LINE)));
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(node);
    return () => watching.disconnect();
  }, [text]);
  return (
    <motion.div
      aria-hidden
      className="relative h-12 overflow-hidden"
      initial={false}
      animate={{ '--old': lines > 1 ? 0.38 : 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        maskImage:
          'linear-gradient(to bottom, rgb(0 0 0 / calc(var(--old) * 0.5)) 0, rgb(0 0 0 / var(--old)) 8px, rgb(0 0 0 / var(--old)) 42%, #000 58%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, rgb(0 0 0 / calc(var(--old) * 0.5)) 0, rgb(0 0 0 / var(--old)) 8px, rgb(0 0 0 / var(--old)) 42%, #000 58%)',
      }}
    >
      <motion.p
        ref={inner}
        initial={false}
        animate={{ y: -Math.max(0, lines - 2) * LINE }}
        transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
        data-muted={muted || undefined}
        className="text-[15px] leading-6 text-pretty text-foreground data-muted:text-muted-foreground"
      >
        {wordsOf(text)
          .map((word, at) => ({ word, at }))
          .slice(-SHOWN)
          .map(({ word, at }) => (
            <motion.span
              key={at}
              initial={{ opacity: 0, filter: 'blur(3px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              {word}
            </motion.span>
          ))}
      </motion.p>
    </motion.div>
  );
}

/** The words so far, or how far voice has come, for a peek. */
export function Peek({ dictation }: { readonly dictation: Dictation }) {
  const phase = useChild(dictation, ({ state }) =>
    state._tag === 'Recording' || state._tag === 'Transcribing'
      ? state._tag
      : null,
  );
  const text = useChild(dictation, ({ state }) =>
    state._tag === 'Recording' || state._tag === 'Transcribing'
      ? state.text
      : '',
  );
  // Whole percent, or -1 while the total is not known, so it draws rarely.
  const downloading = useChild(dictation, ({ state }) => {
    if (state._tag !== 'Recording' && state._tag !== 'Transcribing')
      return null;
    const { downloading } = state;
    if (downloading === null) return null;
    return downloading.total === null || downloading.total === 0
      ? -1
      : Math.floor((downloading.done / downloading.total) * 100);
  });
  if (phase === null || phase === undefined) return null;
  if (downloading !== null && downloading !== undefined)
    return (
      <div data-slot="peek-download" className="flex min-w-0 flex-col">
        <span className="text-xs leading-5 text-muted-foreground">
          First time only on this machine
        </span>
        <p className="text-[15px] leading-6 text-foreground" aria-live="polite">
          Getting voice ready
          {downloading >= 0 && (
            <span className="text-muted-foreground tabular-nums">
              {' '}
              · {downloading}%
            </span>
          )}
          <span className="text-muted-foreground"> · keep talking</span>
        </p>
      </div>
    );
  const said = text ?? '';
  return (
    <div data-slot="heard" className="min-w-0">
      <Rolling
        text={
          said !== ''
            ? said
            : phase === 'Recording'
              ? 'Listening…'
              : 'Writing it out…'
        }
        muted={said === ''}
      />
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </div>
  );
}

/*
 * A Dictation's peek, floating just above its Draft's card without moving
 * anything: what is heard so far while the card does not show its words,
 * or how far voice has come while its Connection gets it ready. It rises
 * in as it comes and sinks away as it goes. Its owner, laid out as a box
 * the card sits in, says when it shows.
 */
export function Afloat({ children }: { readonly children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {children !== null && children !== undefined && children !== false && (
        <motion.div
          key="peek"
          data-slot="peek"
          initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
          animate={{
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] },
          }}
          exit={{
            opacity: 0,
            filter: 'blur(4px)',
            transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
          }}
          className="pointer-events-none absolute inset-x-0 bottom-full z-10 px-4 pt-10 pb-2"
        >
          {/* A veil, not a card: what is behind blurs and sinks into the
              page towards the Draft, with no edge to sit on top of. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-linear-to-b from-transparent via-background/75 to-background backdrop-blur-md mask-t-from-50%"
          />
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
