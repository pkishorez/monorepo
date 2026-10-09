import { Context, Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import { Finder, Geolocation } from './finder/index.js';
import { Places } from './places/index.js';
import {
  Camera,
  FLIGHT_MS,
  Flight,
  Flights,
  LOCATIONS,
  cameraAt,
  clampZoom,
  panned,
} from './world/index.js';

/*
 * A map whose camera is a Node's Model. Foldkit keeps the camera inside
 * maplibre and hears about it after each move; here the Model says where the
 * map looks, and a flight is data: from, to, and since when. The View works
 * out the camera at every Frame, so flights replay and scrub like the road.
 *
 * Landing is a Command that sleeps for the flight's length. A drag or a zoom
 * mid-flight stops the camera where it is and replaces that Command.
 */

const PLACE_ZOOM = 12;
const USER_ZOOM = 13;

const land = Effect.sleep(FLIGHT_MS).pipe(
  Effect.as({ _tag: 'Landed' as const }),
);

const Position = Schema.Struct({ lng: Schema.Number, lat: Schema.Number });

const Model = Schema.Struct({
  camera: Camera,
  flight: Schema.NullOr(Flight),
  selectedId: Schema.NullOr(Schema.String),
  user: Schema.NullOr(Position),
});
type Model = typeof Model.Type;

/** Start a flight from wherever the camera is at this Time. */
const flyTo = (model: Model, at: number, to: Camera) => ({
  camera: cameraAt(model.camera, model.flight, at),
  flight: { from: cameraAt(model.camera, model.flight, at), to, at },
});

/** Stop wherever the camera is at this Time, then change it. */
const stopped = (
  model: Model,
  at: number,
  change: (camera: Camera) => Camera,
) => ({
  model: {
    ...model,
    camera: change(cameraAt(model.camera, model.flight, at)),
    flight: null,
  },
  replaceCommands: model.flight !== null,
});

export const WorldMap = Node.make('WorldMap', {
  requires: { geolocation: Geolocation },
  model: Model,
  message: Schema.TaggedUnion({
    Panned: { dx: Schema.Number, dy: Schema.Number },
    Zoomed: { by: Schema.Number },
    ClickedMarker: { locationId: Schema.String },
    DismissedPopup: {},
    RequestedFlightToPlace: { locationId: Schema.String },
    RequestedFlightToUser: { lng: Schema.Number, lat: Schema.Number },
    Landed: {},
  }),
  provides: [Flights],
  children: { places: Places, finder: Finder },
}).build({
  init: () => ({
    model: {
      camera: { lng: 10, lat: 30, zoom: 1.5 },
      flight: null,
      selectedId: null,
      user: null,
    },
  }),
  provides: ({ send }) =>
    Context.make(Flights, {
      toPlace: (locationId) =>
        send({ _tag: 'RequestedFlightToPlace', locationId }),
      toUser: ({ lng, lat }) =>
        send({ _tag: 'RequestedFlightToUser', lng, lat }),
    }),
  update: {
    Panned: ({ dx, dy }, { model, at }) =>
      stopped(model, at, (camera) => panned(camera, dx, dy)),
    Zoomed: ({ by }, { model, at }) =>
      stopped(model, at, (camera) => ({
        ...camera,
        zoom: clampZoom(camera.zoom + by),
      })),
    ClickedMarker: ({ locationId }, { model }) => ({
      model: { ...model, selectedId: locationId },
    }),
    DismissedPopup: (_, { model }) => ({
      model: { ...model, selectedId: null },
    }),
    RequestedFlightToPlace: ({ locationId }, { model, at }) => {
      const place = LOCATIONS.find((p) => p.id === locationId);
      if (!place) return {};
      const to = { lng: place.lng, lat: place.lat, zoom: PLACE_ZOOM };
      return {
        model: { ...model, ...flyTo(model, at, to), selectedId: locationId },
        commands: [land],
        replaceCommands: true,
      };
    },
    RequestedFlightToUser: ({ lng, lat }, { model, at }) => ({
      model: {
        ...model,
        ...flyTo(model, at, { lng, lat, zoom: USER_ZOOM }),
        user: { lng, lat },
      },
      commands: [land],
      replaceCommands: true,
    }),
    Landed: (_, { model }) =>
      model.flight
        ? { model: { ...model, camera: model.flight.to, flight: null } }
        : {},
  },
});

export { BrowserGeolocation } from './finder/index.js';
