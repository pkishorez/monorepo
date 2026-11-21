import type * as Cloudflare from '@alchemy.run/cloudflare';
import { noFake } from '../no-fake/index.ts';
import type { Where } from './stage.ts';

/*
 * How a backend Worker is bundled, which `Site` does through Vite for the
 * site: anywhere but `alchemy dev`, failing if it carries a fake.
 */

type Build = NonNullable<Cloudflare.WorkerProps['build']>;

/** A backend Worker's `build`, spread into its props: `...backend(at)`. */
export const backend = (at: Pick<Where, 'dev'>): { readonly build?: Build } =>
  at.dev ? {} : { build: { input: { plugins: [noFake() as never] } } };
