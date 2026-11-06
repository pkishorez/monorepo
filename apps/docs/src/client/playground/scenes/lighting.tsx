import { useRef, useState } from 'react';
import { lighting } from '@kestack/dune';
import { HtmlCanvas, Lamp, type HtmlCanvasHandle } from '@kestack/dune/react';
import { ACCENT_HEX, LIVE_HEX, Stage, useLighting } from '../kit/index.ts';

const CODE = `
<HtmlCanvas effect={lighting()}>
  <Dashboard>
    <Lamp color="#f67f2f">
      <button>Deploy</button>
    </Lamp>
  </Dashboard>
</HtmlCanvas>`;

const card = 'rounded-2xl bg-(--pg-raised) p-5';

export function LightingScene() {
  const canvas = useRef<HtmlCanvasHandle>(null);
  const light = useLighting();
  const [lamps, setLamps] = useState(true);
  const [deploys, setDeploys] = useState(12);
  const [name, setName] = useState('aurora');
  return (
    <Stage
      canvas={canvas}
      title="Lighting"
      blurb="A light follows your pointer. The HTML's own shape is a height map: cards rise, catch a sheen on their bevels and cast soft shadows. Lamps are elements that light their neighbours."
      tryThis={[
        'Move the pointer around the cards.',
        'Flip “Lamps” off and on.',
        'Type in the field: it is a real input.',
        'Press Deploy: the count is React state.',
      ]}
      code={CODE}
      controls={light.controls}
    >
      <HtmlCanvas
        ref={canvas}
        effect={lighting(light.values)}
        contentClassName="p-8 text-(--pg-text-2)"
      >
        <div className="mx-auto grid h-full max-w-3xl grid-cols-6 content-center gap-5">
          <div className={`${card} col-span-4`}>
            <p className="text-xs tracking-wider text-(--pg-text-3) uppercase">
              Project
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-(--pg-text)">
              {name || 'untitled'}
            </h3>
            <label className="mt-4 block text-xs text-(--pg-text-3)">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-(--pg-line) bg-(--pg-sunken) px-3 py-2 text-sm text-(--pg-text) outline-none focus-visible:border-transparent focus-visible:outline-2 focus-visible:outline-(--pg-focus)"
              />
            </label>
          </div>
          <div className={`${card} col-span-2 flex flex-col justify-between`}>
            <p className="text-xs tracking-wider text-(--pg-text-3) uppercase">
              Deploys
            </p>
            <p className="text-5xl font-semibold text-(--pg-text) tabular-nums">
              {deploys}
            </p>
          </div>
          <div
            className={`${card} col-span-3 flex items-center justify-between`}
          >
            <div>
              <p className="text-sm font-medium text-(--pg-text)">Lamps</p>
              <p className="text-xs text-(--pg-text-3)">
                Glowing elements light the rest
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={lamps}
              onClick={() => setLamps((on) => !on)}
              className={`relative h-7 w-12 cursor-pointer rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus) ${lamps ? 'bg-(--pg-live)' : 'bg-(--pg-control)'}`}
            >
              <span
                className={`absolute top-1 left-1 size-5 rounded-full bg-(--pg-text) shadow-[0_1px_2px_oklch(0_0_0/0.3)] transition-transform duration-150 ease-out ${lamps ? 'translate-x-5' : ''}`}
              />
            </button>
          </div>
          <div className={`${card} col-span-3 flex items-center gap-3`}>
            <Lamp color={LIVE_HEX} intensity={lamps ? 1.2 : 0} reach={140}>
              <span className="block size-3 rounded-full bg-(--pg-live)" />
            </Lamp>
            <div>
              <p className="text-sm font-medium text-(--pg-text)">Live</p>
              <p className="text-xs text-(--pg-text-3)">eu-west · 38ms</p>
            </div>
          </div>
          <div
            className={`${card} col-span-6 flex items-center justify-between`}
          >
            <p className="text-sm text-(--pg-text-3)">
              Ship the latest build to production.
            </p>
            <Lamp color={ACCENT_HEX} intensity={lamps ? 1.4 : 0} reach={260}>
              <button
                type="button"
                onClick={() => setDeploys((n) => n + 1)}
                className="rounded-xl bg-(--pg-accent) px-5 py-2.5 text-sm font-semibold text-(--pg-accent-ink) hover:bg-(--pg-accent-hover) active:scale-95"
              >
                Deploy
              </button>
            </Lamp>
          </div>
        </div>
      </HtmlCanvas>
    </Stage>
  );
}
