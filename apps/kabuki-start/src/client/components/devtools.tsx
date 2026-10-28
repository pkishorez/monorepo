import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { Start } from '@kestack/kabuki/start';
import { DevtoolsDock } from '@kestack/web-platform/recipes/devtools';

/*
 * Kabuki's devtools around the page, from the button in the bottom-right
 * corner or Ctrl+/: the Timeline of every Message, every move and preload
 * among them, and the Map of the app's Actors, its Places too. The page
 * still scrolls the window, so its scroll is put back as it would be
 * without them. Their code loads the first time they are opened.
 */

const KabukiInspector = lazy(() =>
  import('@kestack/devtools-kabuki/inspector').then((module) => ({
    default: module.KabukiInspector,
  })),
);

export function Devtools({ children }: { readonly children: ReactNode }) {
  const runtime = Start.useRuntime();
  return (
    <DevtoolsDock
      scrolls="window"
      storageKey="kabuki-start:devtools"
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
            <KabukiInspector runtime={runtime} overlay={layout === 'full'} />
          </Suspense>
        )
      }
    >
      {children}
    </DevtoolsDock>
  );
}
