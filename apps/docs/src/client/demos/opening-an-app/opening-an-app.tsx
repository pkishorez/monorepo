import { useState } from 'react';
import type { ReactNode } from 'react';
import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Monitor, Smartphone } from 'lucide-react';
import { DevtoolsDock } from '@kestack/web-platform/recipes/devtools';
import { KabukiInspector } from '@kestack/devtools-kabuki/inspector';
import { Browser } from './browser/index.ts';
import type { Device } from './browser/index.ts';
import { AppView, PastContext } from './screens/index.ts';
import { AppLive } from './story/index.ts';

const Demo = View.app(AppView, { name: 'opening-an-app' });

/**
 * Opening an app, running in a browser window like any app. How it works
 * inside, its tree of Actors and every Message, is in the devtools beside
 * it: the button in the corner, or Ctrl+/. A Step shown there stays shown
 * when they close, until going live.
 */
export function OpeningAnApp({
  actions,
}: {
  /** What sits at the end of the header, such as the site's theme toggle. */
  readonly actions?: ReactNode;
}) {
  const runtime = Demo.useRuntime();
  const { shown, clear } = runtime;
  const [device, setDevice] = useState<Device>('desktop');

  return (
    <DevtoolsDock
      storageKey="opening-an-app:devtools"
      status={
        shown !== null && (
          <span
            title="Showing a past Step"
            className="block size-2 rounded-full bg-amber-500 ring-2 ring-background"
          >
            <span className="sr-only">Showing a past Step</span>
          </span>
        )
      }
      devtools={(layout) => (
        <KabukiInspector runtime={runtime} overlay={layout === 'full'} />
      )}
    >
      <main className="flex h-full flex-col overflow-hidden bg-muted/30">
        <header className="flex h-16 shrink-0 items-center gap-6 px-6 max-sm:h-12 max-sm:gap-3 max-sm:px-4">
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <h1 className="text-sm font-medium">Opening an app</h1>
            <p className="hidden truncate text-[13px] text-muted-foreground lg:block">
              A Kabuki app. Open the devtools to see inside it.
            </p>
          </div>
          <Devices device={device} onChange={setDevice} />
          {actions}
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-20 max-sm:p-0">
          <Browser device={device} address="opening-an.app" onReload={clear}>
            <PastContext value={shown !== null}>
              <Demo />
            </PastContext>
          </Browser>
        </div>
      </main>
    </DevtoolsDock>
  );
}

/** Which device the window is sized for. */
function Devices({
  device,
  onChange,
}: {
  readonly device: Device;
  readonly onChange: (device: Device) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border bg-background p-0.5 max-sm:hidden">
      {(
        [
          ['desktop', Monitor, 'Desktop'],
          ['mobile', Smartphone, 'Mobile'],
        ] as const
      ).map(([each, Icon, label]) => (
        <button
          key={each}
          type="button"
          aria-pressed={device === each}
          onClick={() => onChange(each)}
          className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 outline-offset-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-muted aria-pressed:text-foreground"
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
