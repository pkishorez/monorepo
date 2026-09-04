import type { KVNamespace } from '@cloudflare/workers-types';
import type { SecondaryStorage } from 'better-auth';

export const kvSessionStore = (binding: KVNamespace): SecondaryStorage => ({
  get: (key) => binding.get(key),
  set: (key, value, ttl) =>
    binding.put(key, value, ttl ? { expirationTtl: ttl } : undefined),
  delete: (key) => binding.delete(key),
  getAndDelete: async (key) => {
    const value = await binding.get(key);
    await binding.delete(key);
    return value;
  },
  // Better Auth requires this method on every secondary store, but this
  // package routes rate limiting to D1 because KV cannot implement it safely.
  increment: () => {
    throw new Error(
      'Cloudflare KV does not support atomic increments; use database-backed rate limiting',
    );
  },
});
