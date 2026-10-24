import { useState } from 'react';
import { KabukiDevtools, Inspector } from './kabuki-devtools.tsx';
import { LiveShop } from './fixtures/views.tsx';
import { INK, TONE_NAMES, ink } from './ink/index.ts';
import { SHOP_STEPS, ShopLive } from './fixtures/steps.ts';

/*
 * The devtools on a bigger Shop running live beside them, then the
 * Inspector on Shop, a small app with one of everything: its colours, then
 * the Map at each kind of Step, then the whole thing to walk through.
 * Each can be laid out as a packed tree or an outline, from the button
 * under the Map's zoom controls. The Map's words one at a time are in
 * `map/map.fixture.tsx`.
 */

const steps = SHOP_STEPS.map((step, index) => ({
  id: `${index}`,
  label: step.label,
}));
const LAST = SHOP_STEPS.length - 1;

/** What the live app would say of every Instance's Workers: all at work, but one failed thumbnail. */
const STATUSES = [
  { name: 'thumb', key: 'cup', status: 'running' as const },
  { name: 'thumb', key: 'pot', status: 'failed' as const },
  { name: 'fetch', key: '', status: 'running' as const },
  { name: 'save', key: '', status: 'finished' as const },
  { name: 'heartbeat', key: '', status: 'running' as const },
  { name: 'pay', key: '', status: 'running' as const },
];
const statuses = () => STATUSES;

/**
 * The Inspector at one Step, in a frame of a given width. The Step `head` is
 * where the live app would be: shown there, its Workers' statuses are known.
 */
function At({
  step,
  head = LAST,
  width,
}: {
  readonly step: number;
  readonly head?: number;
  readonly width?: number;
}) {
  const [shown, setShown] = useState(step);
  const isLive = shown === head;
  return (
    <div className="bg-muted/30 relative grid h-svh place-items-center">
      <div
        className="h-full w-full overflow-hidden"
        style={
          width
            ? {
                width,
                maxHeight: 820,
                borderRadius: 24,
                border: '1px solid var(--border)',
              }
            : undefined
        }
      >
        <Inspector
          definition={ShopLive.definition}
          step={SHOP_STEPS[shown]!}
          {...(isLive ? { statuses } : {})}
          timeline={{
            steps,
            shown,
            live: isLive,
            onShow: setShown,
            onLive: () => setShown(head),
          }}
        />
      </div>
    </div>
  );
}

/** The bigger Shop running, its devtools beside it. */
function Live() {
  const runtime = LiveShop.useRuntime();
  return (
    <div className="grid h-svh grid-cols-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(320px,2fr)_5fr] md:grid-rows-1">
      <div className="min-h-0 overflow-auto border-b p-3 md:border-r md:border-b-0">
        <LiveShop />
      </div>
      <div className="min-h-0">
        <KabukiDevtools runtime={runtime} />
      </div>
    </div>
  );
}

function Ink() {
  return (
    <div className="grid min-h-svh grid-cols-1 md:grid-cols-2">
      {(['light', 'dark'] as const).map((theme) => (
        <div
          key={theme}
          data-theme={theme}
          className="bg-background text-foreground p-6"
          style={INK}
        >
          <p className="text-muted-foreground mb-4 text-[10.5px] font-medium tracking-wider uppercase">
            {theme}
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {TONE_NAMES.map((tone) => (
              <div key={tone} className="flex flex-col gap-1.5">
                <div
                  className="h-12 rounded-lg border"
                  style={{ backgroundColor: ink(tone) }}
                />
                <span className="font-mono text-[11px]">{tone}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default {
  'Devtools · a running app': <Live />,
  Ink: <Ink />,
  'Map · init': <At step={0} />,
  'Map · a Worker Sends': <At step={1} />,
  'Map · a View Sends, a Command is asked for': <At step={3} />,
  'Map · keyed Instances, counted in one place': <At step={5} />,
  'Map · a Request up the tree': <At step={7} />,
  'Inspector · walk the Steps': <At step={0} />,
  'Inspector · live Workers': <At step={5} head={5} />,
  'Inspector · in a phone-sized frame': <At step={3} width={390} />,
};
