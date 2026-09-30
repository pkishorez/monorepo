import { GestureZone } from '@kstackz/use-gesture';
import { motion, useTransform } from 'motion/react';
import type { Boards } from './boards.ts';
import { TaskCard } from './card.tsx';
import { Column } from './column.tsx';
import { COLUMNS, type Task } from './data.ts';
import { useBoardGesture } from './gesture.ts';
import { GAP, type Pager } from './pager.ts';

const refreshing = () => new Promise((resolve) => setTimeout(resolve, 900));

/**
 * The board: its columns on a track that pages under the finger, in the
 * zone every card swipe, page and carry is read from.
 */
export function Columns(props: {
  readonly boards: Boards;
  readonly pager: Pager;
}) {
  return (
    <GestureZone className="relative min-h-0 flex-1">
      <div
        ref={props.pager.ref}
        className="absolute inset-y-0 right-[env(safe-area-inset-right)] left-[env(safe-area-inset-left)] overflow-hidden"
      >
        <Track {...props} />
      </div>
    </GestureZone>
  );
}

function Track(props: { readonly boards: Boards; readonly pager: Pager }) {
  const { boards, pager } = props;
  const gesture = useBoardGesture({ boards, pager });
  const { board } = boards;
  const lifted =
    gesture.lifted === undefined
      ? undefined
      : COLUMNS.flatMap((c) => board.columns[c.id]).find(
          (task) => task.id === gesture.lifted?.id,
        );

  return (
    <>
      <motion.div
        className="absolute inset-y-0 left-0 flex"
        style={{
          x: pager.x,
          gap: GAP,
          padding: `${GAP / 2}px ${GAP}px 0`,
          visibility: pager.column === 0 ? 'hidden' : undefined,
        }}
      >
        {COLUMNS.map((column, i) => (
          <Column
            key={column.id}
            id={column.id}
            title={column.title}
            tasks={board.columns[column.id]}
            width={pager.column}
            previous={COLUMNS[i - 1]?.title}
            next={COLUMNS[i + 1]?.title}
            gesture={gesture}
            onRefresh={() => refreshing().then(() => boards.refresh(column.id))}
          />
        ))}
      </motion.div>
      {lifted === undefined ? null : (
        <Carried task={lifted} gesture={gesture} />
      )}
    </>
  );
}

/** The card a hold lifted, under the finger above everything. */
function Carried(props: {
  readonly task: Task;
  readonly gesture: ReturnType<typeof useBoardGesture>;
}) {
  const { overlay, lifted } = props.gesture;
  const rotate = useTransform(overlay.scale, [1, 1.04], [0, 1.5]);
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-30 origin-center"
      style={{
        x: overlay.x,
        y: overlay.y,
        scale: overlay.scale,
        rotate,
        width: lifted?.width,
      }}
    >
      <TaskCard task={props.task} className="shadow-xl ring-foreground/10" />
    </motion.div>
  );
}
