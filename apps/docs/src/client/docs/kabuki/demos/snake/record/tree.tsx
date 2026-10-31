import { AnimatePresence, motion } from 'motion/react';
import type { Snapshot } from '@kestack/kabuki';
import type { View } from '@kestack/kabuki/react';

/*
 * The Actor tree at the Step shown: the Stage, and the Game under it
 * while one is on, each with its State, the data worth reading, and,
 * live, the Workers running in it. The Game's node comes and goes with
 * the Game.
 */

export function Tree({ runtime }: { readonly runtime: View.AppRuntime }) {
  const { history, head, shown } = runtime;
  const stage = history.snapshotAt(
    shown === null ? head : shown === 'init' ? null : shown,
  );
  const game = Object.values(stage.children).flat()[0];
  const workers = (instance: Snapshot.Instance) =>
    shown === null
      ? runtime
          .workers(instance.id)
          .filter((worker) => worker.status === 'running')
          .map((worker) => worker.name)
      : null;
  const s = stage.model as { lives: number; score: number; best: number };
  return (
    <section
      aria-label="Actor tree"
      className="flex flex-col gap-3 p-6 font-mono text-[15px]"
    >
      <Node
        name="Stage"
        state={stage.state._tag}
        fields={[
          ['lives', s.lives],
          ['score', s.score],
          ['best', s.best],
        ]}
        workers={workers(stage)}
      />
      <div className="ml-3 border-l border-border pl-5">
        <AnimatePresence initial={false}>
          {game && (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
              <Node
                name="Game"
                state={game.state._tag}
                fields={gameFields(game)}
                workers={workers(game)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

const gameFields = (
  game: Snapshot.Instance,
): ReadonlyArray<[string, unknown]> => {
  const model = game.model as {
    at: number;
    length: number;
    heading: string;
    food: { x: number; y: number } | null;
  };
  return [
    ['length', model.length],
    ['at', model.at],
    ['heading', model.heading],
    ['food', model.food ? `${model.food.x},${model.food.y}` : '—'],
  ];
};

function Node({
  name,
  state,
  fields,
  workers,
}: {
  readonly name: string;
  readonly state: string;
  readonly fields: ReadonlyArray<[string, unknown]>;
  /** `null` at a past Step: only the live app knows its Workers. */
  readonly workers: ReadonlyArray<string> | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between font-sans">
        <span className="text-base font-semibold">{name}</span>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={state}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="rounded-full bg-foreground px-2.5 py-0.5 text-xs font-medium text-background"
          >
            {state}
          </motion.span>
        </AnimatePresence>
      </div>
      <dl className="grid grid-cols-[6rem_1fr] gap-y-1 tabular-nums">
        {fields.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground">{key}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">workers</dt>
        <dd className="text-[var(--snake)]">
          {workers === null
            ? 'live only'
            : workers.length === 0
              ? '—'
              : workers.join(', ')}
        </dd>
      </dl>
    </div>
  );
}
