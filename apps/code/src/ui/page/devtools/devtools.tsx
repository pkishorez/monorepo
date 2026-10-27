import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { Start } from '@kestack/kabuki/start';
import { DevtoolsDock } from '@kestack/web-platform/recipes/devtools';

/*
 * Kabuki's devtools around every page, while developing: the button in
 * the bottom-right corner opens them full screen, as a bar, a side panel
 * or a floating window. They sit outside code's tree, so picking a past
 * Step Time Travels code itself, read only until it goes live again.
 * Ctrl+/ or ⌘/ opens and closes them too; code shows its keys with
 * Ctrl+? instead. Their code loads the first time they are opened.
 */

const KabukiDevtools = lazy(() =>
  import('@kestack/web-platform/recipes/devtools').then((module) => ({
    default: module.KabukiDevtools,
  })),
);

export function Devtools({ children }: { readonly children: ReactNode }) {
  const runtime = Start.useRuntime();
  return (
    <DevtoolsDock
      storageKey="code:devtools"
      devtools={(layout) =>
        runtime && (
          <Suspense fallback={null}>
            <KabukiDevtools runtime={runtime} overlay={layout === 'full'} />
          </Suspense>
        )
      }
    >
      {children}
    </DevtoolsDock>
  );
}
