export const PluginEnv = {
  name: 'KE_PLUGIN',
  socket: 'KE_SOCKET',
  data: 'KE_DATA',
  state: 'KE_STATE',
  cache: 'KE_CACHE',
} as const;

export const RPC_PATH = '/rpc';

export const READY = { ready: true } as const;

export const isReady = (message: unknown) =>
  typeof message === 'object' &&
  message !== null &&
  'ready' in message &&
  message.ready === true;

export interface PluginFolders {
  readonly data: string;
  readonly state: string;
  readonly cache: string;
}
