// The Web Platform's door: a web app from one config.
export {
  createApp,
  type RootOptions,
  type WebAppConfig,
  type WebAuth,
  type WebAuthApp,
  type WebPublicApp,
} from './app.tsx';
export { webHost } from './host.ts';
export {
  Api,
  defineSession,
  SessionClosed,
  type SessionContext,
  type SessionStatus,
  type Storage,
} from '@kstackz/platform-toolkit';
