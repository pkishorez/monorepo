import type * as Cloudflare from '@alchemy.run/cloudflare';
import { FAKE_AUTH, isFakeAuth, noFakeAuth } from '../dev-auth/index.ts';
import type { Where } from './stage.ts';

/*
 * How a backend Worker is bundled for auth, which `Site` does through
 * Vite for the site: under `alchemy dev` with auth-toolkit's Fake swapped
 * in for its doors (unless `KESTACK_AUTH=real`), and anywhere else failing
 * if it carries the Fake.
 */

// The conditions Alchemy's Cloudflare bundler resolves with when given none.
const WORKER_CONDITIONS = ['workerd', 'worker', 'module', 'browser'];

type Build = NonNullable<Cloudflare.WorkerProps['build']>;

/** A backend Worker's `build`, spread into its props: `...backend(at)`. */
export const backend = (at: Pick<Where, 'dev'>): { readonly build: Build } =>
  isFakeAuth(at.dev)
    ? {
        build: {
          input: {
            resolve: {
              conditionNames: [...WORKER_CONDITIONS, 'production', FAKE_AUTH],
            },
          },
        },
      }
    : { build: { input: { plugins: [noFakeAuth() as never] } } };
