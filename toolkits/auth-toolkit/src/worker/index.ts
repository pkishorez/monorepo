export {
  createAuthWorker,
  isTrustedOrigin,
  validateTrustedOrigins,
} from './worker.js';
export type { Branding, BrandStyle, EmbeddedAsset, PagesApp } from './pages.js';
export {
  AUTHORIZATION_SERVER_PAGES,
  type AuthorizationServerConfig,
  type ClientRegistration,
  type ScopeDefinition,
} from './auth-model.js';
