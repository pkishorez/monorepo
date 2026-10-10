import { Context, Effect, Layer, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { LocateFixed } from 'lucide-react';
import {
  Alert,
  AlertDescription,
} from '@kstackz/web-platform/components/alert';
import { Button } from '@kstackz/web-platform/components/button';
import { Spinner } from '@kstackz/web-platform/components/spinner';
import { Flights } from '../world/index.js';

/*
 * "Find me": Idle → Locating → Idle, or Failed with the reason. Locating asks
 * the browser where the user is through the Geolocation Capability; on success
 * it asks the map to fly there through Flights. Dismissing while Locating
 * stops the lookup by cancelling its keyed Command.
 */

const TIMEOUT_MS = 10_000;

export class Geolocation extends Context.Service<
  Geolocation,
  {
    readonly locate: Effect.Effect<
      { readonly lng: number; readonly lat: number },
      string
    >;
  }
>()('docs/map/Geolocation') {}

export const BrowserGeolocation = Layer.succeed(Geolocation, {
  locate: Effect.callback<{ lng: number; lat: number }, string>((resume) => {
    if (!navigator.geolocation) {
      resume(Effect.fail('Geolocation is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resume(Effect.succeed({ lng: coords.longitude, lat: coords.latitude })),
      (error) => resume(Effect.fail(error.message || 'Could not find you.')),
      { enableHighAccuracy: false, timeout: TIMEOUT_MS },
    );
  }),
});

const locate = Effect.gen(function* () {
  const { lng, lat } = yield* (yield* Geolocation).locate;
  return { _tag: 'SucceededGeolocate' as const, lng, lat };
}).pipe(
  Effect.catch((reason) =>
    Effect.succeed({ _tag: 'FailedGeolocate' as const, reason }),
  ),
);

const flyHome = (lng: number, lat: number) =>
  Effect.gen(function* () {
    yield* (yield* Flights).toUser({ lng, lat });
  });

export const Finder = Actor.make('Finder', {
  requires: { flights: Flights, geolocation: Geolocation },
  state: Schema.TaggedUnion({
    Idle: {},
    Locating: {},
    Failed: { reason: Schema.String },
  }),
  message: Schema.TaggedUnion({
    ClickedFindMe: {},
    DismissedGeolocate: {},
    SucceededGeolocate: { lng: Schema.Number, lat: Schema.Number },
    FailedGeolocate: { reason: Schema.String },
  }),
}).build({
  init: () => ({ state: { _tag: 'Idle' } }),
  update: {
    Idle: {
      ClickedFindMe: () => ({
        state: { _tag: 'Locating' },
        command: { key: 'locate', run: locate },
      }),
    },
    Locating: {
      DismissedGeolocate: () => ({
        state: { _tag: 'Idle' },
        cancel: 'locate',
      }),
      SucceededGeolocate: ({ lng, lat }) => ({
        state: { _tag: 'Idle' },
        command: flyHome(lng, lat),
      }),
      FailedGeolocate: ({ reason }) => ({
        state: { _tag: 'Failed', reason },
      }),
    },
    Failed: {
      ClickedFindMe: () => ({
        state: { _tag: 'Locating' },
        command: { key: 'locate', run: locate },
      }),
      DismissedGeolocate: () => ({ state: { _tag: 'Idle' } }),
    },
  },
});

export const FinderView = View.make(Finder, {
  Idle: ({ send }) => (
    <Button variant="outline" onClick={() => send({ _tag: 'ClickedFindMe' })}>
      <LocateFixed /> Find me
    </Button>
  ),
  Locating: ({ send }) => (
    <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
      <span className="flex items-center gap-2">
        <Spinner /> Finding you…
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => send({ _tag: 'DismissedGeolocate' })}
      >
        Cancel
      </Button>
    </div>
  ),
  Failed: ({ state, send }) => (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-col gap-2">
        <span>{state.reason}</span>
        <span className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => send({ _tag: 'ClickedFindMe' })}
          >
            Try again
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => send({ _tag: 'DismissedGeolocate' })}
          >
            Dismiss
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  ),
});
