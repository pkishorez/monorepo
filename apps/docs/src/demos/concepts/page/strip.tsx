import { motion, useTransform } from 'motion/react';
import type { AppRuntime } from 'effect-oak/react';
import { Marble } from '../shapes/index.js';

/** How much Time the Strip shows: the last ten seconds, scrolling. */
const WINDOW = 10_000;
const LANE = 24;
/** Room on the left so a Marble at Time 0 is whole. */
const PAD = 12;

const at = (time: number) => `calc(${(time / WINDOW) * 100}% + ${PAD}px)`;

/**
 * The marble diagram under the Picture: one lane per Instance on the current
 * Branch, one Marble per Message at its Time, coloured by Source and hollow
 * if ignored or dropped. Clicking a Marble shows that Step; during Time
 * Travel a cursor stands on it.
 */
export const Strip = ({
  useRuntime,
}: {
  readonly useRuntime: () => AppRuntime;
}) => {
  const { log, shown, show, frame } = useRuntime();
  const lanes = [...new Set(log.map((entry) => entry.instance))];
  const x = useTransform(
    frame,
    (time) => `${(-Math.max(0, time - WINDOW) / WINDOW) * 100}%`,
  );
  const cursor =
    shown === 'init' ? 0 : log.find((entry) => entry.id === shown)?.at;
  const height = Math.max(1, lanes.length) * LANE + 8;
  return (
    <div
      data-strip
      className="flex shrink-0 border-t bg-background"
      style={{ height }}
    >
      <div className="flex w-36 shrink-0 flex-col border-r py-1 sm:w-44">
        {lanes.map((id) => (
          <div
            key={id}
            className="truncate px-2 font-mono text-[10px] text-muted-foreground"
            style={{ height: LANE, lineHeight: `${LANE}px` }}
            title={id}
          >
            {id}
          </div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden py-1">
        <motion.div className="relative h-full w-full" style={{ x }}>
          {lanes.map((id, row) => (
            <div
              key={id}
              className="absolute right-0 left-0 h-px bg-border"
              style={{ top: row * LANE + LANE / 2 }}
            />
          ))}
          {log.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={`${entry.message._tag} · ${entry.outcome}`}
              onClick={() => show(entry.id)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-1 ${entry.id === shown ? 'ring-1 ring-foreground' : ''}`}
              style={{
                left: at(entry.at),
                top: lanes.indexOf(entry.instance) * LANE + LANE / 2,
              }}
            >
              <Marble
                source={entry.source.kind}
                hollow={entry.outcome !== 'handled'}
              />
            </button>
          ))}
          {cursor !== undefined && (
            <div
              data-cursor
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-foreground"
              style={{ left: at(cursor) }}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
};
