import { AnimatePresence, motion } from 'motion/react';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { RenderCounts, counted } from '../render-count/index.js';
import { Card, Deck } from './deck.js';

type Way = 'create' | 'wrap';

/**
 * A card that spreads `root` on its own element, so `motion.create` can
 * animate it. Drawn twice, once each way, counting its renders apart.
 */
const CardView = View.make(
  Card,
  (
    { id, model, send, root },
    { selected, way }: { readonly selected: boolean; readonly way: Way },
  ) => {
    counted(`${way} ${id}`);
    return (
      <div
        {...root}
        className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 data-[selected=true]:border-primary"
        data-selected={selected}
      >
        <span className="font-mono">
          {model.label} · {model.bumps}
        </span>
        <Button size="sm" onClick={() => send({ _tag: 'ClickedBump' })}>
          Bump
        </Button>
      </div>
    );
  },
);

const MotionCard = motion.create(CardView);

const enter = { opacity: 0, scale: 0.9 };
const shown = { opacity: 1, scale: 1 };
const leave = { opacity: 0, scale: 0.9, transition: { duration: 0.6 } };

/**
 * The same cards, animated two ways. Left: `motion.create(CardView)`, so the
 * card itself is the motion element. Right: a `motion.div` wrapping the
 * View. A removed card fades out with its last data on both sides.
 */
export const DeckView = View.make(Deck, ({ id, model, children, send }) => {
  counted(id);
  return (
    <div className="flex size-full gap-6 overflow-y-auto p-6">
      <div className="flex flex-1 flex-col gap-4">
        <h1 className="text-lg font-semibold">Deck {model.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => send({ _tag: 'ClickedAdd' })}>Add</Button>
          <Button
            variant="outline"
            onClick={() => send({ _tag: 'ClickedShuffle' })}
          >
            Shuffle
          </Button>
          <Button
            variant="outline"
            onClick={() => send({ _tag: 'ClickedRename' })}
          >
            Rename deck
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <section className="flex flex-col gap-2">
            <h2 className="font-medium">motion.create(CardView)</h2>
            <AnimatePresence>
              {children.cards.map((card) => (
                <MotionCard
                  key={card.id}
                  instance={card}
                  way="create"
                  selected={card.key === model.selected}
                  layout
                  initial={enter}
                  animate={shown}
                  exit={leave}
                />
              ))}
            </AnimatePresence>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-medium">motion.div around CardView</h2>
            <AnimatePresence>
              {children.cards.map((card) => (
                <motion.div
                  key={card.id}
                  layout
                  initial={enter}
                  animate={shown}
                  exit={leave}
                >
                  <CardView
                    instance={card}
                    way="wrap"
                    selected={card.key === model.selected}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </section>
        </div>
        <div className="flex flex-wrap gap-2">
          {children.cards.map((card) => (
            <span key={card.id} className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => send({ _tag: 'ClickedSelect', id: card.key })}
              >
                Select {card.key}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => send({ _tag: 'ClickedRemove', id: card.key })}
              >
                Remove {card.key}
              </Button>
            </span>
          ))}
        </div>
      </div>
      <RenderCounts />
    </div>
  );
});
