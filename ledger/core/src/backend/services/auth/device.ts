import { resolverLocal } from '@kstackz/auth-toolkit/server/rpc';

/** Who a call is from, on this device: whoever its Local Token names. */
export const authDevice = resolverLocal;
