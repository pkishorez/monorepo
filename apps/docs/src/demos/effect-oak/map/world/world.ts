import { Context } from 'effect';

/*
 * What the map's parts share: the camera's math, the featured places, and
 * Flights, the Request the panels use to move the map.
 */

export {
  Camera,
  FLIGHT_MS,
  Flight,
  cameraAt,
  clampZoom,
  panned,
  project,
  worldSize,
} from './camera.js';
export { LOCATIONS } from './locations.js';

/** Whoever owns the camera: the map. */
export class Flights extends Context.Service<
  Flights,
  {
    /** Fly to a featured place and select it. */
    readonly toPlace: (locationId: string) => void;
    /** Fly to where the user is, and mark it. */
    readonly toUser: (position: {
      readonly lng: number;
      readonly lat: number;
    }) => void;
  }
>()('docs/map/Flights') {}
