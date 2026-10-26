import { Effect } from 'effect';
import { cloudflaredInstalled, installCloudflared } from './binary.js';
import { checkTunnel } from './check.js';
import { quickTunnel } from './quick-tunnel.js';

/*
 * A Connection's public address: a Cloudflare quick tunnel to the server on
 * this machine, and the check that it still leads there. Opening another
 * gives a new address, which is how a broken one is restarted. cloudflared
 * is downloaded first, once, when it is missing.
 */

export { cloudflaredInstalled, installCloudflared };

/**
 * A quick tunnel to the server on `port`, through the cloudflared at
 * `cloudflaredBin`, open for as long as the Scope: its
 * `https://*.trycloudflare.com` URL, and an Effect that completes if
 * cloudflared exits on its own. Fails while cloudflared is not installed.
 */
export const openTunnel = (port: number, cloudflaredBin: string) =>
  Effect.andThen(cloudflaredInstalled(cloudflaredBin), (installed) =>
    installed
      ? quickTunnel(`http://127.0.0.1:${port}`)
      : Effect.fail(new Error('cloudflared is not installed')),
  );

/** Whether the server answers at `url`, through its tunnel: a Tunnel Check. */
export const checkAt = checkTunnel;
