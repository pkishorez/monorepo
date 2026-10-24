import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Zap } from 'lucide-react';
import { ink } from '../../ink/index.ts';
import { CARD } from '../../scene/index.ts';
import type { Beats, Placed } from '../../scene/index.ts';

/*
 * The Beats of a Step, laid over the Map, played again for each new Message.
 *
 * 1. Send     the Message's tag sits on the top edge of the card it went
 *             to, with who Sent it. A Worker that Sent it has its row lit.
 * 2. Arrow    an arrow draws itself from exactly what Sent it, the Worker's
 *             row or the Sender's name, out to the right and into the name
 *             of the card it went to: across cards for a Request, a small
 *             loop for a Worker Sending to its own Instance.
 * 3. Command  one chip per Command the Update asked for, on the card's
 *             bottom edge.
 *
 * Each sits on its own card's edges, so it never covers another card.
 *
 * The arrow draws itself, the tag lands as it arrives, the Commands after.
 * When the cards move, a fold say, all of it glides with them. With reduced
 * motion it is simply there.
 */

/** In from a card's right edge. */
const INSET = 10;

const OUT = [0.23, 1, 0.32, 1] as const;
/** The cards' glide to a new place, which everything here rides with. */
const MOVE = { duration: 0.42, ease: [0.32, 0.72, 0, 1] } as const;

/** Where on a card's right edge its name is, or one of its Worker's rows. */
const edgeAt = (card: Placed, worker?: string) => {
  const name = card.y + CARD.pad + CARD.header / 2;
  const index = worker
    ? card.workers.findIndex((row) => row.name === worker)
    : -1;
  const states = card.states ? CARD.gap + card.states.length * CARD.line : 0;
  return {
    x: card.x + card.width,
    y:
      index < 0
        ? name
        : card.y +
          CARD.pad +
          CARD.header +
          states +
          CARD.gap +
          index * CARD.row +
          CARD.row / 2,
  };
};

/** From what Sent it to the name of the card it went to, out to the right. */
const arrowOf = (
  from: { x: number; y: number },
  to: { x: number; y: number },
) => {
  const side =
    Math.max(from.x, to.x) + (Math.abs(from.y - to.y) < 80 ? 30 : 52);
  return `M ${from.x + 3} ${from.y} C ${side} ${from.y}, ${side} ${to.y}, ${to.x + 9} ${to.y}`;
};

export function Beat({
  beats,
  where,
  onPick,
}: {
  readonly beats: Beats;
  /** Where a card is drawn. */
  readonly where: (id: string) => Placed | undefined;
  /** Open the Message. */
  readonly onPick: () => void;
}) {
  const still = useReducedMotion();
  const target = beats.to ? where(beats.to) : undefined;
  const sent = beats.send ? where(beats.send.at) : undefined;
  const from = beats.request ? where(beats.request.from) : undefined;
  const anchor = target
    ? {
        right: target.x + target.width,
        top: target.y,
        bottom: target.y + target.height,
      }
    : sent && {
        right: sent.x + sent.width,
        top: sent.y,
        bottom: sent.y + sent.height,
      };
  // An arrow wherever its start is not already the name it ends at.
  const start = sent && edgeAt(sent, beats.send?.worker);
  const end = target && edgeAt(target);
  const arrow =
    start && end && (start.x !== end.x || start.y !== end.y)
      ? { start, d: arrowOf(start, end) }
      : undefined;
  // The arrow draws itself; the tag lands as it arrives; the Commands after.
  const landing = still ? 0 : arrow ? 0.3 : 0;
  const enter = (delay: number) =>
    still
      ? { initial: false as const }
      : {
          initial: { opacity: 0, scale: 0.92 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: 0.2, ease: OUT, delay },
        };
  // Everything rides with the cards when the Map moves.
  const ride = still ? { duration: 0 } : MOVE;

  return (
    <div className="pointer-events-none absolute top-0 left-0">
      {/* 2. Arrow */}
      {arrow && (
        <svg
          className="absolute top-0 left-0 overflow-visible"
          width={1}
          height={1}
          aria-hidden
        >
          <defs>
            <marker
              id={`kabuki-arrow-${beats.key}`}
              viewBox="0 0 8 8"
              refX="6"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" style={{ fill: ink('message') }} />
            </marker>
          </defs>
          <motion.circle
            r={3}
            style={{ fill: ink('message') }}
            initial={{
              cx: arrow.start.x,
              cy: arrow.start.y,
              scale: still ? 1 : 0,
            }}
            animate={{ cx: arrow.start.x, cy: arrow.start.y, scale: 1 }}
            transition={{
              cx: ride,
              cy: ride,
              scale: { duration: 0.15, ease: OUT },
            }}
          />
          <motion.path
            fill="none"
            strokeWidth={1.75}
            strokeLinecap="round"
            style={{ stroke: ink('message') }}
            markerEnd={`url(#kabuki-arrow-${beats.key})`}
            initial={{ d: arrow.d, pathLength: still ? 1 : 0 }}
            animate={{ d: arrow.d, pathLength: 1 }}
            transition={{
              d: ride,
              pathLength: { duration: 0.45, ease: OUT, delay: 0.05 },
            }}
          />
        </svg>
      )}

      {anchor && (
        <>
          <motion.div
            className="absolute top-0 left-0"
            initial={{ x: anchor.right - INSET, y: anchor.top }}
            animate={{ x: anchor.right - INSET, y: anchor.top }}
            transition={ride}
          >
            {/* 1. Send */}
            <motion.button
              type="button"
              onClick={onPick}
              className="pointer-events-auto flex h-[22px] origin-right items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-[11px] whitespace-nowrap shadow-xs outline-none focus-visible:ring-2"
              style={{
                translate: '-100% -50%',
                backgroundColor: ink('message-soft'),
                borderColor: `color-mix(in oklch, ${ink('message')} 30%, transparent)`,
              }}
              {...enter(landing)}
            >
              {from ? (
                <ArrowUpRight
                  className="size-3"
                  style={{ color: ink('message') }}
                />
              ) : (
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: ink('message') }}
                />
              )}
              <span className="font-medium" style={{ color: ink('message') }}>
                {beats.tag}
              </span>
              {beats.send && (
                <span className="text-muted-foreground">
                  {from ? 'asked by' : 'from'} {beats.send.by}
                </span>
              )}
              {!beats.to && (
                <span className="text-muted-foreground">· dropped</span>
              )}
            </motion.button>
          </motion.div>
          {beats.commands.length > 0 && (
            <motion.div
              className="absolute top-0 left-0"
              initial={{ x: anchor.right - INSET, y: anchor.bottom }}
              animate={{ x: anchor.right - INSET, y: anchor.bottom }}
              transition={ride}
            >
              <div
                className="flex flex-row-reverse gap-1"
                style={{ translate: '-100% -50%' }}
              >
                {/* 3. Command */}
                {beats.commands.map((command, index) => (
                  <motion.span
                    key={`${command.name}-${index}`}
                    className="flex h-5 origin-top items-center gap-1 rounded-full border px-2 font-mono text-[10.5px] whitespace-nowrap"
                    style={{
                      backgroundColor: ink('command-soft'),
                      borderColor: `color-mix(in oklch, ${ink('command')} 35%, transparent)`,
                      color: ink('command'),
                    }}
                    {...enter(landing + 0.12 + index * 0.05)}
                  >
                    <Zap className="size-2.5" />
                    {command.name}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
