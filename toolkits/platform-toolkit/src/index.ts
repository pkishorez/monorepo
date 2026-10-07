/**
 * Running an app on any platform. An app is its APIs, a device Backend for
 * them, a Session for each Account when it signs in, and a cache; a
 * Platform gives the Host and calls `createApp`, and the app calls its
 * Platform's. Nothing here knows the web or Expo.
 */
export {
  Api,
  type ApiClient,
  type ApiClients,
  type Apis,
  type DeviceBackend,
  type DeviceBackends,
  type RpcsOf,
  type Transport,
} from './apis/index.js';
export {
  type AppConfig,
  type AuthApp,
  type AuthConfig,
  createApp,
  type PublicApp,
} from './app/index.js';
export {
  createGate,
  gateReact,
  type Gate,
  type GateConfig,
  type GateNotice,
  type GateReact,
  type GateView,
} from './gate/index.js';
export {
  Backend,
  backendNamed,
  type Host,
  memoryHost,
  type Storage,
  type TableSource,
  type TabMessage,
} from './host/index.js';
export {
  defineSession,
  keepSyncs,
  type Run,
  SessionClosed,
  type SessionContext,
  type SessionDef,
  type SessionOf,
  type SessionStatus,
  type StdSync,
  syncName,
} from './session/index.js';
