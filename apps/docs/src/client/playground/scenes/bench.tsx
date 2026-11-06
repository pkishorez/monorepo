import { useRef, useState, type ReactNode } from 'react';
import { lighting, type EffectInstance } from '@kestack/dune';
import { HtmlCanvas, type HtmlCanvasHandle } from '@kestack/dune/react';
import { Stage } from '../kit/index.ts';

/*
 * The same page, drawn plain and under each effect in turn. For each:
 *
 * - frame: ms to draw one frame end to end (CPU + GPU, waited on), the
 *   true cost whatever the display's refresh rate;
 * - idle: frames drawn per second with nothing happening;
 * - snapshot: ms to copy the HTML in after it changes;
 * - memory: textures held.
 */

const CODE = `
const canvas = useRef<HtmlCanvasHandle>(null);
<HtmlCanvas ref={canvas} effect={lighting()}>…</HtmlCanvas>

canvas.current.benchmark(120); // ms per frame, end to end
canvas.current.stats();        // fps drawn, cpu/gpu ms, snapshots, memory`;

type Config = {
  readonly name: string;
  readonly effect: EffectInstance | ReadonlyArray<EffectInstance> | null;
};

const CONFIGS: ReadonlyArray<Config> = [
  { name: 'Plain HTML', effect: null },
  { name: 'Canvas, no effect', effect: [] },
  { name: 'Lighting', effect: lighting() },
];

type Row = {
  readonly name: string;
  readonly frameMs: number | null;
  readonly idleFps: number | null;
  readonly cpuMs: number | null;
  readonly gpuMs: number | null;
  readonly snapshots: number | null;
  readonly snapshotMs: number | null;
  readonly memoryMb: number | null;
};

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

function Card({ children }: { readonly children: ReactNode }) {
  return <div className="rounded-2xl bg-(--pg-raised) p-5">{children}</div>;
}

function Page({ tick }: { readonly tick: number }) {
  return (
    <div className="mx-auto grid h-full max-w-3xl grid-cols-3 content-center gap-4 text-(--pg-text-2)">
      {['Revenue', 'Guests', 'Rating', 'Nights', 'Cities', 'Reviews'].map(
        (label, i) => (
          <Card key={label}>
            <p className="text-xs tracking-wider text-(--pg-text-3) uppercase">
              {label}
            </p>
            <p className="mt-2 text-3xl font-semibold text-(--pg-text)">
              {(i + 3) * 137}
            </p>
            <p className="mt-1 text-xs text-(--pg-text-3)">
              Lorem ipsum dolor sit amet.
            </p>
          </Card>
        ),
      )}
      <div className="col-span-3 rounded-2xl bg-(--pg-raised) p-5 text-sm leading-relaxed text-(--pg-text-3)">
        A page of ordinary HTML: text, cards and numbers, measured plain and
        under each effect.
        <span className="ml-2 font-mono text-(--pg-text-2) tabular-nums">
          {tick}
        </span>
      </div>
    </div>
  );
}

export function BenchScene() {
  const canvas = useRef<HtmlCanvasHandle>(null);
  const [current, setCurrent] = useState(2);
  const [rows, setRows] = useState<ReadonlyArray<Row>>([]);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const config = CONFIGS[current]!;

  const run = async () => {
    setRunning(true);
    setRows([]);
    for (let i = 0; i < CONFIGS.length; i++) {
      setCurrent(i);
      await wait(900);
      const handle = canvas.current;
      handle?.stats();
      await wait(1500);
      const idle = handle?.stats() ?? null;
      // Then change the DOM every frame for a second: what snapshots cost.
      const churn = setInterval(() => setTick((n) => n + 1), 16);
      await wait(1000);
      clearInterval(churn);
      const busy = handle?.stats() ?? null;
      const frameMs = handle?.benchmark(120) ?? null;
      const row: Row = {
        name: CONFIGS[i]!.name,
        frameMs,
        idleFps: idle?.fps ?? null,
        cpuMs: busy?.cpuMs ?? null,
        gpuMs: busy?.gpuMs ?? null,
        snapshots: busy?.uploads ?? null,
        snapshotMs: busy?.uploadMs ?? null,
        memoryMb: idle?.memoryMb ?? null,
      };
      setRows((all) => [...all, row]);
    }
    setRunning(false);
  };

  return (
    <Stage
      canvas={canvas}
      title="Performance"
      blurb="The same page drawn plain, on a canvas with no effect, and lit. “Frame” is one frame end to end, CPU and GPU, waited on: the real cost whatever your display’s refresh rate. A 60 Hz frame has 16.7 ms."
      tryThis={[
        'Run it with the pointer off the stage: idle is idle.',
        'Still effects draw nothing when nothing changes.',
        'Snapshot is what each DOM change costs.',
      ]}
      code={CODE}
      controls={
        <section className="space-y-3">
          <button
            type="button"
            disabled={running}
            onClick={() => void run()}
            data-bench-run
            className="h-11 w-full cursor-pointer rounded-xl bg-(--pg-accent) text-[13px] font-semibold text-(--pg-accent-ink) transition-[background-color,scale] duration-150 hover:bg-(--pg-accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus) active:scale-[0.98] disabled:cursor-default disabled:bg-(--pg-raised) disabled:text-(--pg-text-3)"
          >
            {running ? `Measuring ${config.name}…` : 'Run benchmark'}
          </button>
          {rows.length > 0 && (
            <table
              className="w-full font-mono text-[11px] text-(--pg-text-2) tabular-nums"
              data-bench-results
            >
              <thead className="text-(--pg-text-3)">
                <tr>
                  <th className="py-1 text-left font-normal">effect</th>
                  <th className="text-right font-normal">frame</th>
                  <th className="text-right font-normal">idle</th>
                  <th className="text-right font-normal">snap</th>
                  <th className="text-right font-normal">MB</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.name}
                    className="border-t border-(--pg-line)"
                    data-row={JSON.stringify(row)}
                  >
                    <td className="py-1">{row.name}</td>
                    <td className="text-right">
                      {row.frameMs === null
                        ? '—'
                        : `${row.frameMs.toFixed(2)}ms`}
                    </td>
                    <td className="text-right">
                      {row.idleFps === null ? '0' : row.idleFps.toFixed(0)}
                    </td>
                    <td className="text-right">
                      {row.snapshotMs === null
                        ? '—'
                        : row.snapshotMs.toFixed(2)}
                    </td>
                    <td className="text-right">
                      {row.memoryMb === null ? '—' : row.memoryMb.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      }
    >
      <HtmlCanvas
        ref={canvas}
        key={config.name}
        plain={config.effect === null}
        effect={config.effect ?? []}
        contentClassName="p-8"
      >
        <Page tick={tick} />
      </HtmlCanvas>
    </Stage>
  );
}
