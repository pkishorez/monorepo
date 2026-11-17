import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { layerOn, type Platform, platform } from '../../platform/index.ts';

/** The app's native shell, as the device knows it. */
export interface Shell {
  /** Its id on the device: the bundle id on iOS, the application id on Android. */
  readonly id: string;
  readonly name: string;
  /** The version a person sees, such as `1.2.0`. */
  readonly version: string;
  /** The build of that version, which a store counts up. */
  readonly build: string;
}

/** What the app is running as. */
export interface AppInfoService {
  /** A browser, or the app's shell on iOS or Android. */
  readonly platform: Platform;
  /** The shell around the page: none in a browser, or where no platform's own was provided. */
  readonly shell: Effect.Effect<Option.Option<Shell>>;
}

const Capability = Context.Reference<AppInfoService>(
  '@kestack/web-platform/capabilities/AppInfo',
  {
    defaultValue: () => ({
      platform: platform(),
      shell: Effect.succeed(Option.none()),
    }),
  },
);

/**
 * What the app is running as. With nothing provided it says the platform,
 * which needs no plugin, and no shell. `AppInfo.layer({ ios, android })`
 * adds the shell's own details on each.
 */
export const AppInfo = Object.assign(Capability, {
  layer: layerOn(Capability),
});
