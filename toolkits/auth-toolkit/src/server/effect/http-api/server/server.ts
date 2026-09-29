import { cannotation } from '../cannotation/index.js';
import { makeAuthzImpl } from './middleware.js';

export { resolverLive } from '../../current-auth/index.js';

export const authzLayer = cannotation.layer(makeAuthzImpl);
