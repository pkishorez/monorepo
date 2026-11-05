import { Effect, type Layer } from 'effect';
import { use } from 'cloudflared';
import type { Downloads } from '@kestack/cli-platform/files';
import { CLOUDFLARED_KEY, cloudflared } from './binary.js';
import { checkTunnel } from './check.js';
import { quickTunnel } from './quick-tunnel.js';

/*
 * A Connection's public address: a Cloudflare quick tunnel to its port on
 * this computer, and the check that it still leads there. Opening another
 * gives a new address, which is how a broken one is restarted. cloudflared
 * comes from the shared cache, downloaded first when it is missing.
 */

export { CLOUDFLARED_KEY };

/**
 * A quick tunnel to the server on `port`, through the cloudflared at
 * `binary`, open for as long as the Scope: its
 * `https://*.trycloudflare.com` URL, and an Effect that completes if
 * cloudflared exits on its own.
 */
const openTunnel = (port: number, binary: string) =>
  Effect.suspend(() => {
    use(binary);
    return quickTunnel(`http://127.0.0.1:${port}`);
  });

/** What Tunnels stands on: cloudflared, kept in `downloads`; opening a quick tunnel; and the Tunnel Check. */
export const tunnels = (downloads: Layer.Layer<Downloads>) => ({
  cloudflared: Effect.provide(cloudflared, downloads),
  open: openTunnel,
  check: checkTunnel,
});
