import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';
import { portlessPort, where } from './stage.ts';

/**
 * The site: one Worker in front of the built assets. Start's Vite plugin
 * gives the Worker its entry, so there is no `main`. It needs no env: the
 * camera, the model and every gesture live in the browser.
 */
export const Website = Cloudflare.Website.Vite(
  'Site',
  Effect.gen(function* () {
    const at = yield* where;
    return {
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: at.dev ? { port: portlessPort() } : undefined,
      domain: at.domain,
    };
  }),
);
