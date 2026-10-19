import { useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationFrame } from 'motion/react';

/*
 * The caption over the recording, one line, from the URL's script:
 * `?script=0:A React component you can rewind|4:Three lives`, each cue its
 * second and its words. N skips to the next cue now, for a take that runs
 * ahead of its script.
 */

type Cue = { readonly at: number; readonly text: string };

const FALLBACK: ReadonlyArray<Cue> = [
  { at: 0, text: 'A React component you can rewind' },
];

export const cuesOf = (script: string | null): ReadonlyArray<Cue> => {
  const cues = (script ?? '')
    .split('|')
    .map((cue) => {
      const colon = cue.indexOf(':');
      return {
        at: Number(cue.slice(0, colon)),
        text: cue.slice(colon + 1).trim(),
      };
    })
    .filter((cue) => Number.isFinite(cue.at) && cue.text)
    .sort((a, b) => a.at - b.at);
  return cues.length > 0 ? cues : FALLBACK;
};

export function Caption({
  cues,
  skips,
}: {
  readonly cues: ReadonlyArray<Cue>;
  /** How many times N was pressed. */
  readonly skips: number;
}) {
  const [index, setIndex] = useState(-1);
  // When the script started, on the frame clock, moved on by each skip.
  const start = useRef<number | undefined>(undefined);
  const skipped = useRef(0);
  useAnimationFrame((now) => {
    start.current ??= now;
    if (skips !== skipped.current) {
      skipped.current = skips;
      const next = cues[index + 1];
      if (next) start.current = now - next.at * 1000;
    }
    const seconds = (now - start.current) / 1000;
    const at = cues.findLastIndex((cue) => cue.at <= seconds);
    if (at !== index) setIndex(at);
  });
  const cue = cues[index];
  return (
    <div className="grid h-full place-items-center overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {cue && (
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="text-center text-[44px] leading-tight font-semibold tracking-tight whitespace-nowrap"
          >
            {cue.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
