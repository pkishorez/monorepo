import { useRouter } from '@tanstack/react-router';
import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import { tanstack } from '@kestack/kabuki/routing/tanstack';
import {
  Kabuki as KabukiPage,
  KabukiLive,
  KabukiView,
} from './page-kabuki/index.js';
import { devtools } from './sessions/index.js';

/*
 * The Kabuki Tool, `/kabuki`: every Kabuki Session connected to this
 * DevTools, and the Inspector on the one picked. A Kabuki app of its own,
 * mounted in DevTools' shell.
 *
 * 1. Sessions  the live list and each Kabuki Session's Api, asked of the
 *              DevTools Server the page came from (`sessions/`).
 * 2. Page      the one page, `/kabuki` (`page-kabuki/`), under a root that
 *              only holds it, routed on the shell's TanStack history, so
 *              its `?session=` is the shell's address too.
 */

// 2. Page
const App = Page.define({ pages: { Kabuki: KabukiPage } });

const AppLive = Page.build(App, { pages: { Kabuki: KabukiLive } });

const AppView = View.make(AppLive, ({ children }) =>
  children.Kabuki ? <KabukiView instance={children.Kabuki} /> : null,
);

const Routed = Router.view(Router.define(App), AppView);

/** The app, made once, on the shell's history. */
let made: ReturnType<typeof make> | undefined;

const make = (history: ReturnType<typeof useRouter>['history']) =>
  View.app(Routed, {
    layer: Layer.mergeAll(
      // 1. Sessions
      devtools(location.origin),
      tanstack({ history: () => history }),
    ),
    name: '@kestack/devtools/kabuki',
  });

/** The Kabuki Tool, filling the shell's main area. */
export function Kabuki() {
  const router = useRouter();
  const KabukiApp = (made ??= make(router.history));
  return <KabukiApp />;
}
