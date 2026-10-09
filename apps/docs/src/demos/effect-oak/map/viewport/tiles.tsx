import { project } from '../world/index.js';

/*
 * OpenStreetMap's raster tiles as plain images: the tiles at the nearest
 * whole zoom that cover the box, scaled for the zoom in between.
 */

const TILE = 256;

type Camera = {
  readonly lng: number;
  readonly lat: number;
  readonly zoom: number;
};

export const Tiles = ({
  camera,
  width,
  height,
}: {
  readonly camera: Camera;
  readonly width: number;
  readonly height: number;
}) => {
  const z = Math.max(0, Math.round(camera.zoom));
  const scale = 2 ** (camera.zoom - z);
  const count = 2 ** z;
  const center = project(camera.lng, camera.lat, z);
  const span = TILE * scale;
  const from = {
    x: Math.floor((center.x - width / 2 / scale) / TILE),
    y: Math.max(0, Math.floor((center.y - height / 2 / scale) / TILE)),
  };
  const to = {
    x: Math.floor((center.x + width / 2 / scale) / TILE),
    y: Math.min(count - 1, Math.floor((center.y + height / 2 / scale) / TILE)),
  };

  const tiles = [];
  for (let ty = from.y; ty <= to.y; ty++) {
    for (let tx = from.x; tx <= to.x; tx++) {
      const wrapped = ((tx % count) + count) % count;
      tiles.push(
        <img
          key={`${z}/${tx}/${ty}`}
          src={`https://tile.openstreetmap.org/${z}/${wrapped}/${ty}.png`}
          alt=""
          draggable={false}
          className="absolute max-w-none select-none"
          style={{
            left: (tx * TILE - center.x) * scale + width / 2,
            top: (ty * TILE - center.y) * scale + height / 2,
            width: Math.ceil(span),
            height: Math.ceil(span),
          }}
        />,
      );
    }
  }
  return <div className="pointer-events-none absolute inset-0">{tiles}</div>;
};
