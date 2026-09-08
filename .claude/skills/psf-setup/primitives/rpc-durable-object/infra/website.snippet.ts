import * as Cloudflare from 'alchemy/Cloudflare';

// Merge into infra/website.ts: one `env` entry per Durable Object instance.
// The Website Worker hosts the class; `WorkerEnv` gains the namespace.
// It stays untyped here so `infra` never imports from `src`.
export const websiteEnv = {
  env: {
    __NAME_ENV___RPC: Cloudflare.DurableObject('__Name__Object'),
  },
};
