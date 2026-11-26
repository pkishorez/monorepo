import { Effect, Layer, Schema } from 'effect';
import {
  type EnabledPlugins,
  PluginHash,
  PluginName,
  RELEASE_PATH,
  releaseKey,
} from '../../../rpc/heartbeat/contract/index.js';
import type { Plugin } from '../../../rpc/app/contract/index.js';
import type { Choices } from '../../connections/contract/index.js';
import {
  Catalog,
  type CatalogEntries,
  type CatalogEntry,
  type ReleaseFiles,
} from '../contract/index.js';

const isEnabled = (name: string, entry: CatalogEntry, choices: Choices) => {
  const choice = Object.hasOwn(choices, name) ? choices[name] : undefined;
  return choice === undefined ? entry.enabledByDefault : choice === 'enabled';
};

export const enabledPlugins = (
  catalog: CatalogEntries,
  choices: Choices,
): EnabledPlugins =>
  Object.fromEntries(
    Object.entries(catalog)
      .filter(([name, entry]) => isEnabled(name, entry, choices))
      .map(([name, { hash, url }]) => [name, { hash, url }]),
  );

export const pluginsOf = (
  catalog: CatalogEntries,
  choices: Choices,
): ReadonlyArray<Plugin> =>
  Object.entries(catalog).map(([name, entry]) => ({
    name,
    enabledByDefault: entry.enabledByDefault,
    enabled: isEnabled(name, entry, choices),
  }));

const isPluginName = Schema.is(PluginName);
const isPluginHash = Schema.is(PluginHash);

export const releaseFileKey = (name: string, hash: string) =>
  `${RELEASE_PATH.slice(1)}/${releaseKey(name, hash)}`;

const fileFrom =
  (files: ReleaseFiles | undefined) =>
  (name: string, hash: string): Effect.Effect<ReadableStream | null> =>
    files === undefined || !isPluginName(name) || !isPluginHash(hash)
      ? Effect.succeed(null)
      : Effect.map(
          Effect.promise(() => files.get(releaseFileKey(name, hash))),
          (found) => found?.body ?? null,
        );

export const catalogLayer = (options: {
  readonly catalog: CatalogEntries;
  readonly files: ReleaseFiles | undefined;
}) =>
  Layer.succeed(
    Catalog,
    Catalog.of({
      enabled: (choices) => enabledPlugins(options.catalog, choices),
      plugins: (choices) => pluginsOf(options.catalog, choices),
      has: (name) => Object.hasOwn(options.catalog, name),
      file: fileFrom(options.files),
    }),
  );
