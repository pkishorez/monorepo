// The guard's server half, for a Backend, read as `authz.*` through the
// door's module namespace so a bundler keeps only the parts a Backend uses:
// `layer` checks every guarded RPC (`http` every guarded HttpApi endpoint)
// with the Resolver it is given; `device` is the Resolver the device Backend
// is given; `cookies` relays the sign-in cookies refreshed while checking, as
// `Rpc.http.server`'s `wrap`. The cloud Resolver is `authz.cloud` from
// `@kstackz/auth-toolkit/server/cloud`.
export { rpcLayer as layer, httpLayer as http } from './authz/index.js';
export { cookies, device } from './authz/index.js';
