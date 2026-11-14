import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { Make, Native } from '../../platform/index.ts';
import type { AppInfoService } from '../web/index.ts';

/**
 * App Info in the app's shell on `on`: what the device says the app is,
 * through Capacitor's plugin, which answers the same way on iOS and
 * Android and not at all in a browser. A shell that does not answer is no
 * shell.
 */
export const shellOn = (on: Native): Make<AppInfoService> =>
  Effect.tryPromise(() => import('@capacitor/app')).pipe(
    Effect.map(({ App }) => ({
      platform: on,
      shell: Effect.tryPromise(() => App.getInfo()).pipe(
        Effect.map(({ id, name, version, build }) =>
          Option.some({ id, name, version, build }),
        ),
        Effect.catch(() => Effect.succeed(Option.none())),
      ),
    })),
  );
