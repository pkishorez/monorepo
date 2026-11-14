import type { nitro, start } from './vite/index.ts';

export type {
  DocumentProps,
  Drawn,
  PageInfo,
  Pages,
  StartApp,
} from './app/index.ts';
export type { Handler, Host, PageCache, Platform } from './platform/index.ts';

/** What the Vite plugin takes: the platform, and where the app's files are. */
export type StartOptions = Parameters<typeof start>[0];
/** What `nitro()` takes: the preset Nitro builds for. */
export type NitroOptions = Parameters<typeof nitro>[0];
