import { Schema } from 'effect';

/*
 * Where the map looks, and how it moves. Positions are Web Mercator, as the
 * tiles are: the world is a square of `256 × 2^zoom` pixels.
 */

export const Camera = Schema.Struct({
  lng: Schema.Number,
  lat: Schema.Number,
  zoom: Schema.Number,
});
export type Camera = typeof Camera.Type;

export const Flight = Schema.Struct({
  from: Camera,
  to: Camera,
  at: Schema.Number,
});
type Flight = typeof Flight.Type;

export const FLIGHT_MS = 1800;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 17;
const TILE = 256;
const MAX_LAT = 85.0511;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export const clampZoom = (zoom: number) => clamp(zoom, MIN_ZOOM, MAX_ZOOM);

/** A point as a fraction of the world, 0 to 1 on both axes. */
const toUnit = (lng: number, lat: number) => {
  const sin = Math.sin((clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
};

const fromUnit = (x: number, y: number) => ({
  lng: ((((x * 360) % 360) + 360) % 360) - 180,
  lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
});

export const worldSize = (zoom: number) => TILE * 2 ** zoom;

/** A point in world pixels at a zoom. */
export const project = (lng: number, lat: number, zoom: number) => {
  const { x, y } = toUnit(lng, lat);
  return { x: x * worldSize(zoom), y: y * worldSize(zoom) };
};

/** The camera moved by a drag of `dx, dy` screen pixels. */
export const panned = (camera: Camera, dx: number, dy: number): Camera => {
  const size = worldSize(camera.zoom);
  const { x, y } = toUnit(camera.lng, camera.lat);
  const unitY = clamp(y - dy / size, 0, 1);
  return { ...fromUnit(x - dx / size, unitY), zoom: camera.zoom };
};

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Where the camera is at a Time: on the ground, or partway through a flight
 * that zooms out, moves and zooms back in.
 */
export const cameraAt = (
  camera: Camera,
  flight: Flight | null,
  at: number,
): Camera => {
  if (!flight) return camera;
  const t = clamp((at - flight.at) / FLIGHT_MS, 0, 1);
  const k = ease(t);
  const a = toUnit(flight.from.lng, flight.from.lat);
  const b = toUnit(flight.to.lng, flight.to.lat);
  const distance = Math.hypot(b.x - a.x, b.y - a.y) * worldSize(0);
  const dip = Math.min(6, Math.log2(1 + distance / 64)) * Math.sin(Math.PI * t);
  return {
    ...fromUnit(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k),
    zoom: clampZoom(
      flight.from.zoom + (flight.to.zoom - flight.from.zoom) * k - dip,
    ),
  };
};
