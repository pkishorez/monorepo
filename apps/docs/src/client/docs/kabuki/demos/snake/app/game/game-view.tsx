import { AnimatePresence, motion } from 'motion/react';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { Kbd } from '@kestack/web-platform/components/kbd';
import { GameLive } from './game.ts';
import { Board } from '../drawing/snake.tsx';

// The board while a game is on; paused, it says how to go on.
export const GameView = View.make(GameLive, ({ _tag, model, send, root }) => (
  <div {...root}>
    <div role="group" aria-label="Snake board. Arrow keys turn, Space pauses.">
      <Board
        track={model.track}
        at={model.at}
        length={model.length}
        food={model.food}
        look={_tag === 'Bitten' || _tag === 'Crashed' ? 'hurt' : 'well'}
      >
        <AnimatePresence>
          {_tag === 'Paused' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70"
            >
              <p className="text-sm font-medium">Paused</p>
              <Button
                variant="outline"
                onClick={() => send({ _tag: 'Resumed' })}
              >
                Resume
                <Kbd>Space</Kbd>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </Board>
    </div>
  </div>
));
