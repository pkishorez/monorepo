import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { Start } from '@kestack/kabuki/start';
import { DevtoolsDock } from '@kestack/web-platform/recipes/devtools-dock';

/*
 * Kabuki's devtools around the page, with `dev` on: from the button in the
 * bottom-right corner or Ctrl+/. Their code loads the first time they are
 * opened.
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
      storageKey="auth-toolkit:devtools"
      devtools={() =>
        runtime && (
          <Suspense fallback={null}>
            <KabukiDevtools runtime={runtime} />
          </Suspense>
        )
      }
    >
      {children}
    </DevtoolsDock>
  );
}
