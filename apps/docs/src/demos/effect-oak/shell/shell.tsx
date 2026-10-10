import type { ComponentType, ReactNode } from 'react';
import type { AppRuntime } from 'effect-oak/react';
import { EffectOakDevtools } from '@kstackz/web-platform/recipes/effect-oak-devtools';

/** An app made with `toReact`: what the shell runs and inspects. */
type OakApp = ComponentType & { readonly useRuntime: () => AppRuntime };

/*
 * The frame every Effect Oak demo runs in: the demo menu on top, and the app
 * beside the Effect Oak devtools, which Time Travel it, stop and start it,
 * and fork it from any Step.
 */
export const Shell = ({
  app: App,
  menu,
}: {
  readonly app: OakApp;
  /** Where the demo's name goes: a menu to go home or to another demo. */
  readonly menu: ReactNode;
}) => (
  <div className="flex h-dvh flex-col bg-background">
    <header className="flex h-12 shrink-0 items-center border-b px-2 sm:px-3">
      {menu}
    </header>
    <EffectOakDevtools runtime={App.useRuntime()}>
      <div className="h-full sm:p-6">
        <App />
      </div>
    </EffectOakDevtools>
  </div>
);
