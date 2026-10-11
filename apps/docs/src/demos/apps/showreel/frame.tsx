import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { EffectOakDevtools } from '@kstackz/web-platform/recipes/effect-oak-devtools';
import { APPS, ShowRenders, type AppName } from '../rockets/index.js';
import type { Shot } from './beats.js';
import { tokens } from './code.js';
import { CHAPTERS } from './script.js';

/*
 * One 1280×720 frame, the whole video's stage: no borders and no window
 * chrome. The code on the left and the app on the right; for Time Travel,
 * the app on the left and its devtools on the right. Scaled to whatever box
 * it is drawn in.
 */

export const W = 1280;
export const H = 720;
const LINE = 24;
/** The code takes the left of the frame, the app the rest. */
const CODE = 700;
const APP = W - CODE;
/** How wide the devtools dock beside the app. */
const PANEL = 440;
const ease = [0.32, 0.72, 0, 1] as const;

export function Frame({ shot }: { shot: Shot }) {
  const [scale, setScale] = useState(0);
  const [measure] = useState(() => (element: HTMLDivElement | null) => {
    if (!element) return;
    const fit = () => setScale(element.clientWidth / W);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(element);
    return () => watch.disconnect();
  });

  const titled = shot.layout === 'title' || shot.layout === 'close';

  return (
    <div
      ref={measure}
      className="relative aspect-video w-full overflow-hidden bg-background text-foreground"
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        <AnimatePresence>
          {titled && (
            <motion.div
              key="title"
              className="absolute inset-0 flex flex-col items-center justify-center gap-4"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, ease }}
            >
              <p className="text-7xl font-semibold tracking-tight">
                Effect Oak
              </p>
              {shot.layout === 'title' && (
                <p className="text-xl text-muted-foreground">
                  Actors for React, run by Effect
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {shot.layout === 'code' && shot.code && (
            <motion.div
              key="code"
              className="absolute top-0 left-0 h-full"
              style={{ width: CODE }}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: shot.attend === 'app' ? 0.6 : 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.9, ease }}
            >
              <Code shot={shot} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {shot.app && <App key={shot.app} name={shot.app} shot={shot} />}
        </AnimatePresence>

        <ChapterMark chapter={shot.chapter} />
      </div>
    </div>
  );
}

/**
 * The app with its devtools docked beside it. Beside the code, the devtools
 * hang off the right edge of the frame, out of sight; for Time Travel the
 * app glides left and they slide in.
 */
function App({ name, shot }: { name: AppName; shot: Shot }) {
  const Running = APPS[name];
  const devtools = shot.layout === 'devtools';
  return (
    <motion.div
      className="absolute top-0 flex h-full flex-col"
      initial={{
        opacity: 0,
        left: CODE,
        width: APP + PANEL,
        clipPath: `inset(0px ${PANEL}px 0px 0px)`,
      }}
      animate={{
        opacity: shot.attend === 'code' ? 0.6 : 1,
        left: devtools ? 0 : CODE,
        width: devtools ? W : APP + PANEL,
        clipPath: `inset(0px ${devtools ? 0 : PANEL}px 0px 0px)`,
      }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1, ease }}
    >
      <EffectOakDevtools runtime={Running.useRuntime()}>
        <Mount on={shot.moment === 'mount'}>
          <ShowRenders value={shot.moment === 'renders'}>
            <Running />
          </ShowRenders>
        </Mount>
      </EffectOakDevtools>
    </motion.div>
  );
}

/** The chapter's title: big in the middle as the chapter starts, then small in the corner. */
function ChapterMark({ chapter }: { chapter: number }) {
  const [shown, setShown] = useState({ chapter, big: true });
  if (shown.chapter !== chapter) setShown({ chapter, big: true });
  if (chapter === 0) return null;
  const { title } = CHAPTERS[chapter]!;
  const big = shown.chapter === chapter && shown.big;
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-background"
        initial={false}
        animate={{ opacity: big ? 0.92 : 0 }}
        transition={{ duration: 0.8, ease }}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={chapter}
          className="absolute top-0 left-0 z-20"
          initial={{ opacity: 0, x: W / 2, y: H / 2, scale: 1.6 }}
          animate={
            big
              ? { opacity: 1, x: W / 2, y: H / 2, scale: 1.6 }
              : { opacity: 1, x: 48, y: 36, scale: 1 }
          }
          exit={{ opacity: 0 }}
          transition={{ duration: big ? 0.8 : 1.1, ease }}
          onAnimationComplete={() => {
            if (big)
              setTimeout(
                () =>
                  setShown((now) =>
                    now.chapter === chapter ? { chapter, big: false } : now,
                  ),
                1200,
              );
          }}
          style={{ transformOrigin: '0 0' }}
        >
          <motion.div
            className="relative flex items-baseline gap-3"
            initial={{ x: '-50%', y: '-50%' }}
            animate={big ? { x: '-50%', y: '-50%' } : { x: 0, y: 0 }}
            transition={{ duration: 1.1, ease }}
          >
            <span className="font-mono text-sm text-muted-foreground">
              {chapter}
            </span>
            <span className="text-2xl font-semibold tracking-tight whitespace-nowrap">
              {title}
            </span>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

/** The code, coloured, with the lines being explained lit and the rest dimmed. */
function Code({ shot }: { shot: Shot }) {
  const lines = tokens(shot.code!);
  const [from, to] = shot.focus ?? [1, lines.length];
  const lit = (i: number) => i + 1 >= from && i + 1 <= to;
  // Keep the lit lines in the middle of the panel.
  const middle = ((from + to - 1) / 2) * LINE;
  const offset = Math.min(0, (H - 160) / 2 - middle);
  const seen = new Map<string, number>();
  const error = shot.moment === 'compile-error';

  return (
    <div className="relative size-full">
      <AnimatePresence mode="popLayout">
        <motion.p
          key={shot.file}
          className="absolute top-24 left-12 font-mono text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {shot.file}
        </motion.p>
      </AnimatePresence>
      <div
        className="absolute inset-x-0 top-32 bottom-0 overflow-hidden pr-6 pl-12"
        style={{
          maskImage:
            'linear-gradient(transparent, black 24px, black calc(100% - 56px), transparent)',
        }}
      >
        <motion.pre
          className="pt-4 font-mono text-[13.5px]"
          animate={{ y: offset }}
          transition={{ duration: 1, ease }}
          style={{ lineHeight: `${LINE}px` }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {lines.map((line, i) => {
              const text = line.map((token) => token.text).join('');
              const n = seen.get(text) ?? 0;
              seen.set(text, n + 1);
              return (
                <motion.div
                  key={`${text}#${n}`}
                  layout="position"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: lit(i) ? 1 : 0.36, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease }}
                  className={`whitespace-pre ${
                    error && /^\s*provides: \[/.test(text)
                      ? 'line-through decoration-red-500 decoration-2'
                      : ''
                  } ${
                    error && /requires:/.test(text)
                      ? 'underline decoration-red-500 decoration-wavy underline-offset-4'
                      : ''
                  }`}
                  style={{ minHeight: LINE }}
                >
                  {line.length === 0
                    ? ' '
                    : line.map((token, j) => (
                        <span
                          key={j}
                          className="text-(--light) dark:text-(--dark)"
                          style={
                            {
                              '--light': token.light,
                              '--dark': token.dark,
                            } as CSSProperties
                          }
                        >
                          {token.text}
                        </span>
                      ))}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.pre>
      </div>
      {error && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-14 left-12 font-mono text-sm text-red-500"
        >
          Rocket Requires Weather, which nothing above it Provides.
        </motion.p>
      )}
    </div>
  );
}

/** The pop-up: the app lifts forward as one component, then settles back. */
function Mount({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <motion.div
      className="relative size-full"
      animate={on ? { scale: [1, 0.84, 0.84, 1] } : { scale: 1 }}
      transition={{ duration: 3.4, times: [0, 0.2, 0.8, 1], ease }}
    >
      {on && (
        <motion.div
          className="pointer-events-none absolute inset-6 z-10 rounded-2xl border border-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 3.4, times: [0, 0.2, 0.8, 1] }}
        >
          <span className="absolute -top-3 left-6 bg-background px-2 font-mono text-sm">
            {'<App />'}
          </span>
        </motion.div>
      )}
      {children}
    </motion.div>
  );
}
