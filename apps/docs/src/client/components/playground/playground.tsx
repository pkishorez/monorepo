import type { ComponentType } from 'react';
import type { AppRuntime } from '@kestack/kabuki/react/view';
import { Inside } from './inside.tsx';
import { Timeline } from './timeline.tsx';
import { stepOf } from './steps.ts';

/*
 * A docs app, running, and everything kabuki knows about it. The app on
 * one side; beside it, what is inside: every Actor, its State, its Model
 * and its Workers. Below both, the Timeline: one dot per Message, to show
 * the app as it was right after any of them. On a phone it is one column,
 * and it fills its Demo's height, so pressing anything never moves the
 * page.
 */

/** What `View.app` makes: the app, and a way to read its Runtime. */
export type PlaygroundApp = ComponentType & {
  readonly useRuntime: () => AppRuntime;
};

export function Playground({ app: App }: { readonly app: PlaygroundApp }) {
  const runtime = App.useRuntime();
  const past = runtime.shown !== null;
  const at = stepOf(runtime);
  return (
    <div className="grid h-full min-h-[34rem] grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] sm:min-h-[26rem]">
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,10rem)] sm:grid-cols-[minmax(0,1fr)_15rem] sm:grid-rows-1">
        <div className="relative min-h-0 overflow-auto">
          {past && (
            <p className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-foreground px-2.5 py-1 text-xs whitespace-nowrap text-background">
              Step {at} of {runtime.branch.length}, read only
            </p>
          )}
          <div
            inert={past}
            className="grid min-h-full place-items-center p-6 transition-opacity sm:p-8"
          >
            <App />
          </div>
        </div>
        <Inside runtime={runtime} />
      </div>
      <Timeline runtime={runtime} />
    </div>
  );
}
