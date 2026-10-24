import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Kbd } from '@kestack/web-platform/ui/components/kbd';
import { LIVES, walk } from '../rules.ts';
import { GameView } from '../game/game-view.tsx';
import { StageLive } from './stage.ts';
import { BOARD, Board, COLORS } from '../drawing/snake.tsx';

/** A key's hint, on a primary button. */
const ON_PRIMARY = 'bg-primary-foreground/15 text-primary-foreground';

/** Before the first game, the snake lies curled as the S of its name. */
const LETTER = walk({ x: 9, y: 2 }, 'LLLLLLDDDDRRRRRRDDDDLLLLLL');

// The game as a poster: the score in large type, the lives as heads, the
// board, and one line with the one thing to do next. Each screen fades
// into the next in the board's place.
export const StageView = View.make(
  StageLive,
  ({ _tag, model, state, children, send, root }) => (
    <MotionConfig reducedMotion="user">
      <section
        {...root}
        aria-label="Snake"
        className={`flex flex-col gap-5 ${COLORS}`}
        style={{ ...root.style, width: BOARD }}
      >
        <header className="flex h-14 items-end justify-between">
          {_tag === 'Ready' ? (
            <h2 className="text-5xl font-semibold tracking-tight">Snake</h2>
          ) : (
            <p className="flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-tight tabular-nums">
                {model.score}
              </span>
              <span className="text-sm text-muted-foreground">
                {model.score === 1 ? 'point' : 'points'}
              </span>
            </p>
          )}
          <Lives lives={model.lives} />
        </header>
        {/* The board is the frame: the snake runs right up to its edge, and
            through it. */}
        <div
          className="relative overflow-hidden rounded-3xl bg-muted/50"
          style={{ width: BOARD, height: BOARD }}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={_tag}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              {_tag === 'Ready' && (
                <Board
                  track={LETTER}
                  at={LETTER.length - 1}
                  length={LETTER.length}
                />
              )}
              {_tag === 'Playing' && <GameView instance={children.game} />}
              {_tag === 'Over' && (
                <Board
                  track={state.body}
                  at={state.body.length - 1}
                  length={state.body.length}
                  look="dead"
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <footer className="flex h-10 items-center justify-between gap-4 text-sm text-muted-foreground">
          {_tag === 'Ready' && (
            <>
              <p>Three lives. Don’t bite your tail.</p>
              <Button size="lg" onClick={() => send({ _tag: 'Start' })}>
                Start game
                <Kbd className={ON_PRIMARY}>Space</Kbd>
              </Button>
            </>
          )}
          {_tag === 'Playing' && (
            <p className="flex items-center gap-1.5">
              <Kbd>←</Kbd>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <Kbd>→</Kbd>
              <span className="mr-2">to turn,</span>
              <Kbd>Space</Kbd>
              to pause
            </p>
          )}
          {_tag === 'Over' && (
            <>
              <p className="tabular-nums">
                Out of lives. Best is {model.best}.
              </p>
              <Button size="lg" onClick={() => send({ _tag: 'Start' })}>
                Play again
                <Kbd className={ON_PRIMARY}>Space</Kbd>
              </Button>
            </>
          )}
        </footer>
      </section>
    </MotionConfig>
  ),
);

/** The lives as small heads; one lost turns grey. */
function Lives({ lives }: { readonly lives: number }) {
  return (
    <span
      role="img"
      aria-label={`${lives} of ${LIVES} lives left`}
      className="flex gap-2 pb-2"
    >
      {Array.from({ length: LIVES }, (_, n) => (
        <svg key={n} viewBox="0 0 20 20" className="size-5" aria-hidden>
          <motion.circle
            cx={10}
            cy={10}
            r={9}
            initial={false}
            animate={{
              fill: n < lives ? 'var(--snake-head)' : 'var(--snake-dead)',
            }}
            transition={{ duration: 0.2 }}
          />
          <circle cx={13} cy={6.5} r={2.4} fill="var(--snake-eye)" />
          <circle cx={13} cy={13.5} r={2.4} fill="var(--snake-eye)" />
          <circle cx={13.8} cy={6.5} r={1.2} fill="var(--snake-pupil)" />
          <circle cx={13.8} cy={13.5} r={1.2} fill="var(--snake-pupil)" />
        </svg>
      ))}
    </span>
  );
}
