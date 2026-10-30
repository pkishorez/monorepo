import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { Start } from '@kestack/kabuki/start';
import { DevtoolsDock } from '@kestack/web-platform/recipes/devtools';

/*
 * Kabuki's Inspector around every page, while developing, in Web
 * Platform's Dock: the button in the bottom-right corner opens it full
 * screen, as a bar, a side panel or a floating window. It reads code
 * through the Kabuki Session Api, answered in memory by code's running
 * app. It sits outside code's tree, so picking a past Step Time Travels
 * code itself, read only until it goes live again. Not on a phone, where
 * the button would cover the Draft's Send and Stop.
 * Ctrl+/ or ⌘/ opens and closes them too; code shows its keys with
 * Ctrl+? instead. Their code loads the first time they are opened.
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
      storageKey="code:devtools"
      onPhones={false}
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
