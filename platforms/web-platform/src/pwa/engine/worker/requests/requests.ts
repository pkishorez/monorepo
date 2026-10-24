import type * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { WorkerBuildInfo } from '../../shared/config/index.js';
import { isNeverCached } from '../../shared/strategy/index.js';
import type { GlobalScope, KeepAlive } from '../global-scope/index.js';
import { handleNavigation, isHandledNavigation } from './pages/index.js';
import { precachedUrls, servePrecached } from '../precache/index.js';
import { handleRuntimeCache } from './strategies/index.js';

type Handler = Effect.Effect<Response, Error, GlobalScope | KeepAlive>;

/**
 * Decides synchronously (so `respondWith` can be called in time) who answers
 * a request. None means the browser fetches it as if there were no worker.
 * Order: only GET over http(s); `neverCache` bypasses everything;
 * navigations; Precache entries; Runtime Cache rules.
 */
export const makeFetchRouter = (info: WorkerBuildInfo, origin: string) => {
  const precached = precachedUrls(info, origin);
  return (request: Request): Option.Option<Handler> => {
    const url = new URL(request.url);
    if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
      return Option.none();
    }
    if (isNeverCached(info.config.neverCache, request, origin)) {
      return Option.none();
    }
    if (request.mode === 'navigate') {
      return isHandledNavigation(info, request, origin)
        ? Option.some(handleNavigation(info, request))
        : Option.none();
    }
    url.hash = '';
    if (precached.has(url.href)) {
      return Option.some(servePrecached(info.buildId, request));
    }
    return handleRuntimeCache(info.config, request, origin);
  };
};
