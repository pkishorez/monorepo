export {
  createAuthWorker,
  isTrustedOrigin,
  validateTrustedOrigins,
} from './worker.js';
export type { EmbeddedAsset, PagesApp } from './pages.js';
export {
  AUTH_PAGES,
  type Branding,
  type BrandStyle,
  type PagesContext,
} from '../../auth-worker-contract/index.js';
export type {
  AuthorizationServerConfig,
  ClientRegistration,
  MultiSessionConfig,
  ScopeDefinition,
} from './auth-model.js';
