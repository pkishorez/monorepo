import { Effect } from 'effect';
import { Authz } from '@kestack/auth-toolkit';
import { belowMinimum } from '../../heartbeat/contract/index.js';
import { AppApi, PluginNotFound } from '../contract/index.js';
import { Catalog } from '../../../services/catalog/contract/index.js';
import {
  type Choice,
  Connections,
} from '../../../services/connections/contract/index.js';

const choose = (id: string, plugin: string, choice: Choice) =>
  Effect.gen(function* () {
    const principal = yield* Authz.User;
    const connections = yield* Connections;
    const catalog = yield* Catalog;
    if (!catalog.has(plugin))
      return yield* new PluginNotFound({ name: plugin });
    yield* connections.choose(principal, id, plugin, choice);
  });

export const appHandlers = (minConnect: string | null) =>
  AppApi.toLayer({
    List: () =>
      Effect.gen(function* () {
        const principal = yield* Authz.User;
        const connections = yield* Connections;
        const catalog = yield* Catalog;
        const kept = yield* connections.list(principal);
        return kept.map(({ choices, ...connection }) => ({
          ...connection,
          outdated: belowMinimum(connection.version, minConnect),
          plugins: Object.fromEntries(
            Object.entries(catalog.enabled(choices)).map(([name, { hash }]) => [
              name,
              hash,
            ]),
          ),
        }));
      }),
    Rename: ({ id, displayName }) =>
      Effect.gen(function* () {
        const principal = yield* Authz.User;
        const connections = yield* Connections;
        yield* connections.rename(principal, id, displayName);
      }),
    Remove: ({ id }) =>
      Effect.gen(function* () {
        const principal = yield* Authz.User;
        const connections = yield* Connections;
        yield* connections.remove(principal, id);
      }),
    Plugins: ({ id }) =>
      Effect.gen(function* () {
        const principal = yield* Authz.User;
        const connections = yield* Connections;
        const catalog = yield* Catalog;
        const { choices } = yield* connections.find(principal, id);
        return catalog.plugins(choices);
      }),
    EnablePlugin: ({ id, plugin }) => choose(id, plugin, 'enabled'),
    DisablePlugin: ({ id, plugin }) => choose(id, plugin, 'disabled'),
  });
