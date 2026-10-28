import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start';
import { useSyncExternalStore } from 'react';
import { KabukiInspector } from '@kestack/devtools-kabuki/inspector';
import * as routes from '../routes/index.ts';
import { KabukiLive } from './actor.ts';

/*
 * The page: its header, and Kabuki's Inspector on code itself. The
 * Inspector is drawn inside the app it inspects, so a Step picked only
 * looks back at first: Time Travelling code would travel this page away
 * with it. The server has no running app, so while the page it drew is
 * hydrated, it is drawn as the server drew it, and the Inspector only
 * after.
 */

const never = () => () => {};

export const KabukiView = View.make(KabukiLive, ({ root }) => {
  const runtime = Start.useRuntime();
  const hydrating = useSyncExternalStore(
    never,
    () => false,
    () => true,
  );
  return (
    <div
      {...root}
      className="flex h-dvh flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 pt-[env(safe-area-inset-top)] md:px-4">
        <h1 className="flex min-h-14 items-center gap-2 text-sm font-semibold">
          Kabuki
          <span className="font-normal text-muted-foreground">code</span>
        </h1>
        <Router.Link
          to={routes.home()}
          className="ml-auto text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
        >
          Back to code
        </Router.Link>
      </header>
      <div className="min-h-0 flex-1">
        {runtime && !hydrating ? (
          <KabukiInspector runtime={runtime} defaultTravel={false} />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            code has not started yet.
          </p>
        )}
      </div>
    </div>
  );
});

export default KabukiView;
