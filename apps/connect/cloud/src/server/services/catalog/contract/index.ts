import { Context } from 'effect';
import type { Effect } from 'effect';
import type { EnabledPlugins } from '../../../rpc/heartbeat/contract/index.js';
import type { Plugin } from '../../../rpc/app/contract/index.js';
import type { Choices } from '../../connections/contract/index.js';

export class Catalog extends Context.Service<Catalog, CatalogCalls>()(
  'ConnectCloud/server/Catalog',
) {}

export interface CatalogEntry {
  readonly hash: string;
  readonly url: string;
  readonly enabledByDefault: boolean;
}
export type CatalogEntries = Readonly<Record<string, CatalogEntry>>;
export interface ReleaseFiles {
  readonly get: (
    key: string,
  ) => Promise<{ readonly body: ReadableStream | null } | null>;
}
export interface CatalogCalls {
  readonly enabled: (choices: Choices) => EnabledPlugins;
  readonly plugins: (choices: Choices) => ReadonlyArray<Plugin>;
  readonly has: (name: string) => boolean;
  readonly file: (
    name: string,
    hash: string,
  ) => Effect.Effect<ReadableStream | null>;
}
