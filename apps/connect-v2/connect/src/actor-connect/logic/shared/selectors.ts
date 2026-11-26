import { join } from 'node:path';
import type { DataOf } from '@kestack/kabuki/types';
import type { ConnectShape, Release } from './shape.js';

type Data = DataOf<typeof ConnectShape>;
type Model = Data['model'];

const CONTROL = 'connect';

export const keyOf = (name: string, hash: string) => `${name}@${hash}`;

export const nameOfKey = (key: string) => key.slice(0, key.indexOf('@'));

const MOST_SOCKET_BYTES = 103;

const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

type Homed = Pick<Model, 'settings'>;

const socketFits = (model: Homed, name: string) =>
  model.settings.pluginHome.sockets.suffix === '' ||
  new TextEncoder().encode(socketOf(model, name)).length <= MOST_SOCKET_BYTES;

export const runnable = (model: Homed, plugins: Model['plugins']) =>
  Object.fromEntries(
    Object.entries(plugins).filter(
      ([name]) =>
        PLUGIN_NAME.test(name) && name !== CONTROL && socketFits(model, name),
    ),
  );

export const samePlugins = (a: Model['plugins'], b: Model['plugins']) => {
  const left = Object.entries(a);
  return (
    left.length === Object.keys(b).length &&
    left.every(([name, release]) => b[name]?.hash === release.hash)
  );
};

export const socketOf = (model: Homed, name: string) => {
  const { prefix, suffix } = model.settings.pluginHome.sockets;
  return `${prefix}${name}${suffix}`;
};

export const controlOf = (model: Homed) => socketOf(model, CONTROL);

export const pluginKeys = (model: Model) =>
  Object.entries(model.plugins).map(([name, release]) =>
    keyOf(name, release.hash),
  );

export const pluginInputOf = (model: Model, key: string) => {
  const name = nameOfKey(key);
  const release: Release = model.plugins[name]!;
  const home = model.settings.pluginHome;
  return {
    name,
    release,
    home: {
      folders: {
        data: join(home.data, name),
        state: join(home.state, name),
        cache: join(home.cache, name),
      },
      socket: socketOf(model, name),
      logFile: join(home.state, `${name}.log`),
    },
    firstRetryAfter: model.settings.firstRetryAfter,
  };
};

export const routesOf = (model: Model) =>
  Object.fromEntries(
    Object.entries(model.plugins).map(([name, release]) => [
      name,
      { hash: release.hash, socket: socketOf(model, name) },
    ]),
  );

const MOST_BACKOFF = 60_000;

export const backoffAfter = (refusals: number, first: number) =>
  refusals <= 1 ? 0 : Math.min(first * 2 ** (refusals - 2), MOST_BACKOFF);

const AGAIN_WITHIN = 60_000;

export const refusalsAfterSignOut = (model: Model, at: number) =>
  model.signIn.at !== null && at - model.signIn.at < AGAIN_WITHIN
    ? model.signIn.refusals + 1
    : 1;
