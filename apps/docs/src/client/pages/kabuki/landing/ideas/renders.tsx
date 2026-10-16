import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  Cursor,
  Flash,
  Roll,
  SPRING,
  useSteps,
  useTargets,
} from '../../../../components/index.ts';

/*
 * Only what changed draws again: an app drawn as a wireframe, each block
 * of it an Actor. A pointer goes from block to block clicking: a like on
 * a card, the header's switch, an item in the sidebar. Each click changes
 * only the block it lands in, and only that block is outlined as it
 * draws again, the way React's devtools mark a render. The rest stay
 * still.
 */

type Block = 'header' | 'sidebar' | 'card-0' | 'card-1' | 'card-2' | 'card-3';

/** What each click lands on, and the block that draws because of it. */
const CLICKS: ReadonlyArray<{
  readonly target: string;
  readonly block: Block;
}> = [
  { target: 'like-1', block: 'card-1' },
  { target: 'switch', block: 'header' },
  { target: 'like-2', block: 'card-2' },
  { target: 'item-2', block: 'sidebar' },
  { target: 'like-1', block: 'card-1' },
  { target: 'item-0', block: 'sidebar' },
];
/** Each click: the pointer goes there, presses, and the block holds. */
const PHASES = [650, 150, 1300];
const STEPS = CLICKS.flatMap(() => PHASES);

/** The app after this many clicks, and how many times each block drew. */
function after(clicks: number) {
  const likes = [3, 8, 1, 5];
  const draws: Record<string, number> = {};
  let on = false;
  let item = 0;
  for (let at = 0; at < clicks; at++) {
    const click = CLICKS[at % CLICKS.length]!;
    draws[click.block] = (draws[click.block] ?? 0) + 1;
    if (click.target === 'switch') on = !on;
    if (click.target.startsWith('item-')) item = Number(click.target.at(-1));
    if (click.target.startsWith('like-')) likes[Number(click.target.at(-1))]!++;
  }
  return { likes, on, item, draws };
}

export function Renders() {
  const [ref, step, round] = useSteps(STEPS, 1);
  const targets = useTargets(ref);
  const index = Math.floor(step / PHASES.length);
  const phase = step % PHASES.length;
  const clicked = phase >= 1;
  const clicks = round * CLICKS.length + index + (clicked ? 1 : 0);
  const app = after(clicks);
  const target = targets[CLICKS[index]!.target];
  return (
    <div ref={ref} className="relative w-full max-w-80">
      <div className="grid gap-2 rounded-xl border border-border bg-background p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <Part
          draws={app.draws['header']}
          className="flex h-9 items-center justify-between px-2.5"
        >
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[4px] bg-foreground" />
            <Bar className="w-14" />
          </span>
          <span
            data-target="switch"
            className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors duration-200 ${app.on ? 'bg-foreground' : 'bg-foreground/20'}`}
          >
            <motion.span
              initial={false}
              animate={{ x: app.on ? 12 : 0 }}
              transition={SPRING}
              className="size-3 rounded-full bg-background"
            />
          </span>
        </Part>
        <div className="grid grid-cols-[4.5rem_1fr] gap-2">
          <Part
            draws={app.draws['sidebar']}
            className="flex flex-col gap-1 p-1.5"
          >
            {[0, 1, 2, 3].map((item) => (
              <span
                key={item}
                data-target={`item-${item}`}
                className="relative flex h-5 items-center px-1.5"
              >
                {item === app.item && (
                  <motion.span
                    layoutId="renders-item"
                    transition={SPRING}
                    className="absolute inset-0 rounded-[5px] bg-foreground/10"
                  />
                )}
                <Bar
                  strong={item === app.item}
                  className={`relative ${item === app.item ? 'w-9' : 'w-7'}`}
                />
              </span>
            ))}
          </Part>
          <div className="grid grid-cols-2 gap-2">
            {app.likes.map((likes, card) => (
              <Part
                key={card}
                draws={app.draws[`card-${card}`]}
                className="flex flex-col gap-1.5 p-2"
              >
                <span className="h-6 rounded-[5px] bg-foreground/[0.07]" />
                <Bar className="w-10" />
                <span className="flex items-center justify-between">
                  <Bar className="w-5" />
                  <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                    <span
                      data-target={`like-${card}`}
                      className="grid size-3.5 place-items-center rounded-full border border-foreground/40"
                    >
                      <span className="size-1.5 rounded-full bg-foreground/60" />
                    </span>
                    <Roll value={likes} />
                  </span>
                </span>
              </Part>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-4 flex items-center justify-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="size-2.5 rounded-[3px] border-[1.5px] border-foreground" />
        drew again
      </p>
      <Cursor
        at={target && { x: target.x + 2, y: target.y + 2 }}
        pressed={phase === 1}
        clicks={clicks}
      />
    </div>
  );
}

/** A block of the app: an Actor, outlined each time it draws. */
function Part({
  draws,
  className,
  children,
}: {
  readonly draws: number | undefined;
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={`relative rounded-lg border border-border ${className}`}>
      {children}
      <Flash at={draws} />
    </div>
  );
}

/** A line of text, as a wireframe draws it. */
function Bar({
  className,
  strong = false,
}: {
  readonly className: string;
  readonly strong?: boolean;
}) {
  return (
    <span
      className={`h-1.5 rounded-full transition-colors duration-200 ${strong ? 'bg-foreground/60' : 'bg-foreground/20'} ${className}`}
    />
  );
}
