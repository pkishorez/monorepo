import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { WorkerBuildInfo } from '../../../contract/config/index.js';
import { fetchNetwork, GlobalScope } from '../../global-scope/index.js';
import { matchPrecache, SHELL_URL } from '../../precache/index.js';

/** A file opened in a tab, or Kabuki Start's own address: never a page of the app. */
const isPage = (pathname: string): boolean =>
  !pathname.startsWith('/_kabuki/') && !/\.[^/]+$/.test(pathname);

/** Whether the worker answers this navigation; anything else goes straight to the network. */
export const isHandledNavigation = (
  info: WorkerBuildInfo,
  request: Request,
  origin: string,
): boolean => {
  const url = new URL(request.url);
  return (
    request.mode === 'navigate' &&
    url.origin === origin &&
    isPage(url.pathname) &&
    !info.config.navigation.denylist.some((prefix) =>
      url.pathname.startsWith(prefix),
    )
  );
};

/**
 * Every page is this build's App Shell, whatever its Render Mode, without
 * asking the network: the app starts in it at the page's URL, and each page
 * that needs data asks the server for it, as a move in the app does. So the
 * app always opens, server data needs a connection, and every page stays on
 * this Build ID while a newer version waits. With no App Shell, as for an
 * app not on Kabuki Start, a page is the network's.
 */
export const handleNavigation = (
  info: WorkerBuildInfo,
  request: Request,
): Effect.Effect<Response, Error, GlobalScope> =>
  Effect.flatMap(
    matchPrecache(info.buildId, SHELL_URL),
    Option.match({
      onNone: () => fetchNetwork(request),
      onSome: Effect.succeed,
    }),
  );
