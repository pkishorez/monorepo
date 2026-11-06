import { useEffect, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ActivityIcon } from 'lucide-react';
import type { Stats } from '@kestack/dune';
import type { HtmlCanvasHandle } from '@kestack/dune/react';

/*
 * What the canvas costs, live: frames drawn, main-thread and GPU time per
 * frame, snapshots copied in, and texture memory. Switched on from the
 * sidebar, remembered across scenes, and polled twice a second only while
 * it shows.
 */

const KEY = 'playground:performance';

const remembered = () => {
  try {
    return localStorage.getItem(KEY) === 'shown';
  } catch {
    return false;
  }
};

/** Whether the panel shows, remembered across scenes and reloads. */
export const usePerformance = () => {
  const [shown, setShown] = useState(remembered);
  const set = (next: boolean) => {
    setShown(next);
    try {
      localStorage.setItem(KEY, next ? 'shown' : 'hidden');
    } catch {
      // Private mode: it just isn't remembered.
    }
  };
  return [shown, set] as const;
};

/** The switch for it, in a scene's sidebar: the whole row toggles it. */
export function PerformanceSwitch({
  shown,
  onChange,
}: {
  readonly shown: boolean;
  readonly onChange: (shown: boolean) => void;
}) {
  return (
    <label className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-(--pg-line) px-3 transition-colors duration-150 hover:bg-(--pg-raised)/50">
      <span className="flex items-center gap-2.5 text-[13px] text-(--pg-text-2)">
        <ActivityIcon
          className={`size-4 transition-colors duration-150 ${shown ? 'text-(--pg-accent-text)' : 'text-(--pg-text-3)'}`}
          strokeWidth={1.75}
        />
        Show performance
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={shown}
        aria-label="Show performance"
        onClick={() => onChange(!shown)}
        className="relative h-5 w-9 shrink-0 cursor-pointer rounded-full bg-(--pg-control) transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus) aria-checked:bg-(--pg-accent)"
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-(--pg-text) shadow-[0_1px_2px_oklch(0_0_0/0.3)] transition-transform duration-150 ease-out ${shown ? 'translate-x-4' : ''}`}
        />
      </button>
    </label>
  );
}

/** The panel, over the top right of the stage while shown. */
export function Hud({
  canvas,
  shown,
}: {
  readonly canvas: RefObject<HtmlCanvasHandle | null>;
  readonly shown: boolean;
}) {
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] },
          }}
          exit={{
            opacity: 0,
            scale: 0.96,
            y: -4,
            transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
          }}
          style={{ transformOrigin: 'top right' }}
          className="absolute top-3 right-3 z-10"
        >
          <Live canvas={canvas} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Live({
  canvas,
}: {
  readonly canvas: RefObject<HtmlCanvasHandle | null>;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    canvas.current?.stats();
    const id = setInterval(
      () => setStats(canvas.current?.stats() ?? null),
      500,
    );
    return () => clearInterval(id);
  }, [canvas]);
  if (!stats) return <Panel rows={[['canvas', 'plain HTML']]} />;
  return (
    <Panel
      rows={[
        [
          'drawn',
          `${stats.fps.toFixed(0)} fps${stats.animated ? '' : ' (on change)'}`,
        ],
        ['cpu', `${stats.cpuMs.toFixed(2)} ms/frame`],
        [
          'gpu',
          stats.gpuMs === null ? 'n/a' : `${stats.gpuMs.toFixed(2)} ms/frame`,
        ],
        [
          'snapshots',
          `${stats.uploads.toFixed(0)}/s · ${stats.uploadMs.toFixed(2)} ms`,
        ],
        ['pixels', `${stats.width}×${stats.height}`],
        ['textures', `${stats.memoryMb.toFixed(0)} MB`],
      ]}
    />
  );
}

function Panel({
  rows,
}: {
  readonly rows: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <dl className="pointer-events-none grid grid-cols-[auto_auto] gap-x-4 gap-y-1 rounded-xl border border-(--pg-line) bg-(--pg-panel)/85 px-3.5 py-2.5 font-mono text-[11px] text-(--pg-text-2) shadow-[0_8px_24px_oklch(0_0_0/0.3)] backdrop-blur-md">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-(--pg-text-3)">{label}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
