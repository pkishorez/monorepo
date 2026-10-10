import { View } from 'effect-oak/react';
import { FinderView } from './finder/index.js';
import { WorldMap } from './map.js';
import { PlacesView } from './places/index.js';
import { Viewport } from './viewport/index.js';
import { cameraAt } from './world/index.js';

export const WorldMapView = View.make(
  WorldMap,
  ({ model, children, send, frame }) => (
    <div className="flex size-full flex-col md:flex-row">
      <aside className="flex max-h-[40%] flex-col gap-3 border-b p-4 md:max-h-none md:w-72 md:border-r md:border-b-0">
        <header>
          <h1 className="text-lg font-semibold">Map</h1>
          <p className="text-sm text-muted-foreground">
            The camera is a Node's Model; flights are drawn at every Frame.
          </p>
        </header>
        <FinderView node={children.finder} />
        <PlacesView node={children.places} />
      </aside>
      <main className="min-h-0 flex-1">
        <Viewport
          cameraAt={(at) => cameraAt(model.camera, model.flight, at)}
          frame={frame}
          selectedId={model.selectedId}
          user={model.user}
          onPan={(dx, dy) => send({ _tag: 'Panned', dx, dy })}
          onZoom={(by) => send({ _tag: 'Zoomed', by })}
          onMarker={(locationId) => send({ _tag: 'ClickedMarker', locationId })}
          onDismiss={() => send({ _tag: 'DismissedPopup' })}
        />
      </main>
    </div>
  ),
);
