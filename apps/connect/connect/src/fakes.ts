import { FakeWorld } from '@kestack/kabuki/fake';
import type { Input } from './actor-connect/index.js';
import { cloud } from './services/cloud/fake/index.js';
import { cloudflared } from './services/cloudflared/fake/index.js';
import { control } from './services/control/fake/index.js';
import { plugins } from './services/plugins/fake/index.js';
import { server } from './services/server/fake/index.js';
import { signIn } from './services/sign-in/fake/index.js';
import { store } from './services/store/fake/index.js';

export const fakes = [
  signIn,
  cloud,
  cloudflared,
  plugins,
  server,
  control,
  store,
] as const;

export const makeWorld = () => FakeWorld.make([...fakes]);

export const devInput = (
  settings: Partial<Omit<Input['settings'], 'tunnel'>> & {
    readonly tunnel?: Partial<Input['settings']['tunnel']>;
  } = {},
): Input => ({
  connection: {
    name: 'dev',
    computerName: 'Fake-MacBook',
    cloud: 'https://connect.fake',
    version: '0.0.0-dev',
  },
  settings: {
    heartbeatEvery: 2_000,
    firstRetryAfter: 1_000,
    ...settings,
    tunnel: {
      port: 0,
      origins: [],
      reachEvery: 5_000,
      rotateKeyEvery: 5 * 60 * 1000,
      ...settings.tunnel,
    },
    pluginHome: {
      data: '/fake/data/plugins',
      state: '/fake/state/plugins',
      cache: '/fake/cache/plugins',
      sockets: { prefix: '/fake/run/', suffix: '.sock' },
      ...settings.pluginHome,
    },
  },
});
