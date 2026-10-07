/**
 * The guard's server half with the cloud Resolver, for the cloud Backend:
 * everything `@kstackz/auth-toolkit/server`'s `authz` has, plus `cloud`.
 * A door of its own because the cloud Resolver brings better-auth, which a
 * device Backend must not bundle, and Metro bundles every import.
 */
export * as authz from './authz.js';

export { verifyAccessToken } from '../plain/access-token/index.js';
export { createMcpResourceServer } from '../plain/mcp/index.js';
export { verifyRequest } from '../plain/session/index.js';
