import { Duration, Effect, Layer } from 'effect';
import { use } from 'cloudflared';
import { Downloads } from '../../downloads/contract/index.js';
import { HEALTH } from '../../../http/link/contract/index.js';
import { Cloudflared, TunnelFailed } from '../contract/index.js';
import { binary } from './binary.js';
import { quickTunnel } from './quick-tunnel.js';

export { CLOUDFLARED_KEY } from './binary.js';

const CHECK = Duration.seconds(10);

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export const reachable = (url: string) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(`${url.replace(/\/+$/, '')}${HEALTH}`, {
        signal,
      });
      await response.body?.cancel();
      return response.ok;
    },
    catch: () => false,
  }).pipe(
    Effect.timeoutOrElse({
      duration: CHECK,
      orElse: () => Effect.succeed(false),
    }),
    Effect.catch(() => Effect.succeed(false)),
  );

export const layer = Layer.effect(
  Cloudflared,
  Effect.map(Downloads, (downloads) =>
    Cloudflared.of({
      open: (port) =>
        binary.pipe(
          Effect.provideService(Downloads, downloads),
          Effect.flatMap((path) =>
            Effect.suspend(() => {
              use(path);
              return quickTunnel(`http://127.0.0.1:${port}`);
            }),
          ),
          Effect.mapError(
            (cause) => new TunnelFailed({ message: messageOf(cause) }),
          ),
        ),
      reachable,
    }),
  ),
);
