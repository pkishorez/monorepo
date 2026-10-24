import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { Start } from '@kestack/kabuki/start';
import { DevtoolsDock } from '@kestack/web-platform/recipes/devtools-dock';

/*
 * Kabuki's devtools around the page, from the button in the bottom-right
 * corner or Ctrl+/: the Timeline of every Message, every move and preload
 * among them, and the Map of the app's Actors, its Places too. The page
 * still scrolls the window, so its scroll is put back as it would be
 * without them. Their code loads the first time they are opened.
 */

const KabukiDevtools = lazy(() =>
  import('@kestack/web-platform/recipes/kabuki-devtools').then((module) => ({
    default: module.KabukiDevtools,
  })),
);

export function Devtools({ children }: { readonly children: ReactNode }) {
  const runtime = Start.useRuntime();
  return (
    <DevtoolsDock
      scrolls="window"
      storageKey="hands:devtools"
      status={
        runtime?.shown != null && (
          <span
            title="Showing a past Step"
            className="block size-2 rounded-full bg-foreground ring-2 ring-background"
          >
            <span className="sr-only">Showing a past Step</span>
          </span>
        )
      }
      devtools={(layout) =>
        runtime && (
          <Suspense fallback={null}>
            <KabukiDevtools
              runtime={runtime}
              {...(layout === 'full'
                ? {
                    dotted: false,
                    className: 'bg-background/45 backdrop-blur-[3px]',
                  }
                : {})}
            />
          </Suspense>
        )
      }
    >
      {children}
    </DevtoolsDock>
  );
}
