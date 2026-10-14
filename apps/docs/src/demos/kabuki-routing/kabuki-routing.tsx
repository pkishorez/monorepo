import { useState } from 'react';
import type { ReactNode } from 'react';
import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { tanstack } from '@kestack/kabuki/routing/adapter/tanstack';
import { DevtoolsDock } from '@kestack/web-platform/recipes/devtools-dock';
import { KabukiDevtools } from '@kestack/web-platform/recipes/kabuki-devtools';
import { App } from './app/index.ts';
import { BASE, Routes } from './routes/index.ts';

const Root = Router.app(Routes, App, { base: BASE });

/** The same app twice: once routing in memory, the default, once on TanStack's history. */
const Memory = toReact(Root.actor, Root.view, Layer.empty, {
  name: 'kabuki-routing:memory',
});
const TanStack = toReact(Root.actor, Root.view, tanstack(), {
  name: 'kabuki-routing:tanstack',
  input: Root.startAt,
});

type Adapter = 'memory' | 'tanstack';
const KEY = 'kabuki-routing:adapter';

/** TanStack when the page was opened at a place in the app, else what was picked last, else memory. */
const firstAdapter = (): Adapter => {
  if (typeof location === 'undefined') return 'memory';
  if (location.pathname.length > BASE.length + 1) return 'tanstack';
  return localStorage.getItem(KEY) === 'tanstack' ? 'tanstack' : 'memory';
};

/**
 * A routed Kabuki app in a browser window, with a switch for where its
 * address lives: in memory, where the window's own bar is the only address,
 * or on TanStack Router, where the browser's address moves with it. How it
 * works inside is in the devtools beside it: the button in the corner, or
 * Ctrl+/.
 */
export function KabukiRouting({
  actions,
}: {
  /** What sits at the end of the header, such as the site's theme toggle. */
  readonly actions?: ReactNode;
}) {
  const [adapter, setAdapter] = useState<Adapter>(firstAdapter);
  const memory = Memory.useRuntime();
  const onTanStack = TanStack.useRuntime();
  const runtime = adapter === 'memory' ? memory : onTanStack;
  const Drawn = adapter === 'memory' ? Memory : TanStack;
  const pick = (next: Adapter) => {
    localStorage.setItem(KEY, next);
    setAdapter(next);
  };

  return (
    <DevtoolsDock
      storageKey="kabuki-routing:devtools"
      status={
        runtime.shown !== null && (
          <span
            title="Showing a past Step"
            className="block size-2 rounded-full bg-amber-500 ring-2 ring-background"
          >
            <span className="sr-only">Showing a past Step</span>
          </span>
        )
      }
      devtools={(layout) => (
        <KabukiDevtools
          runtime={runtime}
          {...(layout === 'full'
            ? {
                dotted: false,
                className: 'bg-background/45 backdrop-blur-[3px]',
              }
            : {})}
        />
      )}
    >
      <main className="flex h-full flex-col overflow-hidden bg-muted/30">
        <header className="flex h-16 shrink-0 items-center gap-3 px-6 max-sm:h-12 max-sm:px-4">
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <h1 className="text-sm font-medium">Routing a Kabuki app</h1>
            <p className="hidden truncate text-[13px] text-muted-foreground lg:block">
              {adapter === 'memory'
                ? 'In memory: the browser’s address never moves.'
                : `On TanStack: the app owns every URL under ${BASE}.`}
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Where the address lives"
            className="flex rounded-full border border-border bg-background p-0.5"
          >
            {(
              [
                ['memory', 'Memory'],
                ['tanstack', 'TanStack'],
              ] as const
            ).map(([each, label]) => (
              <button
                key={each}
                type="button"
                role="radio"
                aria-checked={adapter === each}
                onClick={() => pick(each)}
                className="h-7 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors duration-150 outline-offset-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-checked:bg-muted aria-checked:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>
          {actions}
        </header>
        <div className="flex min-h-0 flex-1 justify-center px-6 pb-20 max-sm:p-0">
          <div className="@container relative flex h-full w-full max-w-[1080px] flex-col overflow-hidden bg-background sm:rounded-2xl sm:border sm:border-border sm:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.18)]">
            <Drawn key={adapter} />
          </div>
        </div>
      </main>
    </DevtoolsDock>
  );
}
