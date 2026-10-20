import { View } from '@kestack/kabuki/react';
import { Page } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start';
import { App, router } from '../shared/pages/index.ts';
import { browserLayer, ConsoleLive, ConsoleView } from './console/index.ts';
import Document from './document.tsx';
import './styles.css';

/*
 * The Console app, drawn by the Worker and carried on in the browser. Its
 * actor tree mirrors the route tree and the component tree:
 *
 *   Router (Start)
 *   └─ App        the root page, holding Console
 *      └─ Console the sign-in gate and Account menu; Provides Api, Session
 *         ├─ Welcome
 *         ├─ Settings    └─ Credentials └─ AddCredential
 *         ├─ NewProject  └─ AddCredential
 *         └─ Project     └─ RunView (Production's latest run)
 *            └─ Run      └─ RunView
 *
 * A URL that names no page draws the root's not-found screen, and a 404.
 */

const AppLive = Page.build(App, { pages: { Console: ConsoleLive } });

const AppView = View.make(AppLive, (self) => (
  <div {...self.root}>
    {self.children.Console ? (
      <ConsoleView instance={self.children.Console} />
    ) : (
      <main className="flex min-h-dvh flex-col items-start justify-center gap-2 px-4 sm:items-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          This page doesn't exist.
        </h1>
        <a className="text-sm underline underline-offset-4" href="/">
          Go to Console
        </a>
      </main>
    )}
  </div>
));

export default Start.app(router, AppView, {
  document: Document,
  layer: browserLayer,
});
