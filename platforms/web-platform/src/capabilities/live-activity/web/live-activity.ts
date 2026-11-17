import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { layerOn } from '../../platform/index.ts';

/** What a Live Activity shows as it starts. */
export interface Activity {
  readonly title: string;
  /** One line on where it is, such as `Driver is 5 minutes away`. */
  readonly status: string;
  /** How far along, from 0 to 1; none shows no bar. */
  readonly progress?: number | undefined;
}

/** What a running Live Activity shows next; its title stays. */
export type Change = Omit<Activity, 'title'>;

/**
 * A live card on the Lock Screen and in the Dynamic Island, which iOS
 * keeps up to date while the app is away. A device that cannot show one,
 * or a person who turned them off, answers `false` or none: nothing fails.
 */
export interface LiveActivityService {
  /** Whether this device can show one now. */
  readonly supported: Effect.Effect<boolean>;
  /** Starts one, and says its id; none where it was not started. */
  readonly start: (activity: Activity) => Effect.Effect<Option.Option<string>>;
  /** Shows a change on the one with this id; `false` when there is none running. */
  readonly update: (id: string, change: Change) => Effect.Effect<boolean>;
  /** Takes the one with this id away. */
  readonly end: (id: string) => Effect.Effect<boolean>;
}

/** The web's: a browser has no Live Activities, so it starts none. */
const web: LiveActivityService = {
  supported: Effect.succeed(false),
  start: () => Effect.succeed(Option.none()),
  update: () => Effect.succeed(false),
  end: () => Effect.succeed(false),
};

const Capability = Context.Reference<LiveActivityService>(
  '@kestack/web-platform/capabilities/LiveActivity',
  { defaultValue: () => web },
);

/**
 * Live Activities, none unless an app says otherwise: with nothing
 * provided it is not supported and starts nothing.
 * `LiveActivity.layer({ ios })` makes it iOS's own in the app's Shell.
 */
export const LiveActivity = Object.assign(Capability, {
  layer: layerOn(Capability),
});
