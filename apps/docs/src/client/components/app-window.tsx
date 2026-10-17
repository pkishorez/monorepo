import { Suspense, lazy } from 'react';
import type { PlaygroundApp } from './playground/index.ts';

/*
 * A demo app in a window of its own, the way it would sit in a browser:
 * a title bar with its address, the app in the middle, and the Kabuki
 * devtools under it, in the same window, always open. Showing a past Step
 * makes the app read only. The devtools load apart from the page, so the
 * app is ready before they are.
 */

const KabukiDevtools = lazy(() =>
  import('@kestack/web-platform/recipes/kabuki-devtools').then((module) => ({
    default: module.KabukiDevtools,
  })),
);

export function AppWindow({
  app: App,
  url,
}: {
  /** What `toReact` makes. */
  readonly app: PlaygroundApp;
  /** The address in the title bar. */
  readonly url: string;
}) {
  const runtime = App.useRuntime();
  const past = runtime.shown !== null;
  return (
    <figure className="my-8 overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.18)]">
      <div className="flex h-10 items-center gap-3 border-b border-border bg-muted/40 px-3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center rounded-md bg-background px-2.5 font-mono text-xs text-muted-foreground">
          {url}
        </div>
        <div className="w-[42px]" aria-hidden />
      </div>
      <div
        inert={past}
        className="grid h-[20rem] place-items-center overflow-auto p-6"
      >
        <App />
      </div>
      <div className="h-[26rem] border-t border-border">
        <Suspense
          fallback={
            <p className="grid h-full place-items-center text-sm text-muted-foreground">
              Opening the devtools…
            </p>
          }
        >
          <KabukiDevtools runtime={runtime} />
        </Suspense>
      </div>
    </figure>
  );
}
