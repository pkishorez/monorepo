import { cannotation } from './cannotation.js';
import { makeAuthzImpl } from './middleware.js';

export { resolverLive } from '../current-auth-resolver/index.js';

export const authzLayer = cannotation.layer(makeAuthzImpl);
